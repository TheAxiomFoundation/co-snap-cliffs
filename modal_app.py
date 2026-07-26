"""Modal deployment for the multi-state cliff explorer (co-snap + ny-snap).

Hosts the ``axiom-rules-engine`` Rust binary plus per-program rulespec trees,
exposed as a single HTTP service the Vercel app calls.

Two execution paths share the same wire shape (``POST /run``):

1. No parameter overrides → run the prebuilt ``<slug>.compiled.json``
   artifact baked into the image. Fast (no compile).
2. Parameter overrides supplied → patch the in-image rulespec YAMLs
   in a per-request scratch tree, compile, run. Adds ~70 ms.

The Vercel-hosted Next.js app proxies ``/api/cliff-sweep`` here; see
``src/lib/engine/run.ts``.

Program layout: each program gets its own pinned pair of trees under
``/opt/programs/<slug>/`` using the canonical ``rulespec-*`` dir names the
engine's import resolution expects — ``rulespec-us`` (federal) next to
``rulespec-us-co`` / ``rulespec-us-ny`` (state). The two programs pin
*different* federal SHAs because each compiled base schema
(src/lib/programs/*-base.ts) is bound to the exact input set its federal
tree produces; bumping a federal pin requires regenerating that program's
base module.

Deploy:
    modal deploy modal_app.py

First deploy compiles Rust (~3-4 min); subsequent deploys reuse the cached
layer unless ``ENGINE_VERSION`` changes.

Deployed URL prints as ``https://policyengine--co-snap-cliffs-web.modal.run``;
set that as ``AXIOM_ENGINE_URL`` on the Vercel project.
"""

import modal

app = modal.App("co-snap-cliffs")

ENGINE_VERSION = "v5-multi-state"

# Pinned commit SHAs. The engine SHA matches the local dev binary
# (axiom-rules @431039f, mirrored in the axiom-rules-engine repo) — it must
# use the canonical `rulespec-{prefix}` repo-name resolution, which both the
# NY compile and the scratch-tree override path rely on. Each program's
# rulespec SHAs are bound to its generated base module
# (src/lib/programs/<slug>-base.ts); bump them together and regenerate the
# base via scripts/generate-program-base.py when upgrading.
AXIOM_RULES_ENGINE_SHA = "431039f02d3fff60cd0c3c074f0ab4318042f002"
# Colorado pair (unchanged since v4; co-snap-base.ts is bound to these).
RULESPEC_US_CO_FEDERAL_SHA = "2f3a30991e1f8279c2fa664e51f068a63d905591"
RULESPEC_US_CO_SHA = "ba00673d73c19f262d542cfa597b0b365a1313b7"
# New York pair (ny-snap-base.ts is bound to these).
RULESPEC_US_NY_FEDERAL_SHA = "4c24f37420928e5b210e0a5719642ef5d615493f"
RULESPEC_US_NY_SHA = "13456f86822961ddd04d7f3dfa5940223d58c245"

DEFAULT_PROGRAM = "ny-snap"

# slug -> (federal SHA, state repo name, state SHA, program yaml rel path)
PROGRAMS = {
    "co-snap": {
        "federal_sha": RULESPEC_US_CO_FEDERAL_SHA,
        "state_repo": "rulespec-us-co",
        "state_sha": RULESPEC_US_CO_SHA,
        "program_rel": "policies/cdhs/snap/fy-2026-benefit-calculation.yaml",
    },
    "ny-snap": {
        "federal_sha": RULESPEC_US_NY_FEDERAL_SHA,
        "state_repo": "rulespec-us-ny",
        "state_sha": RULESPEC_US_NY_SHA,
        "program_rel": "policies/otda/snap/fy-2026-benefit-calculation.yaml",
    },
}

BIN_PATH = "/opt/axiom-rules-engine/target/release/axiom-rules-engine"

_clone_and_compile = []
for _slug, _cfg in PROGRAMS.items():
    _root = f"/opt/programs/{_slug}"
    _clone_and_compile += [
        f"mkdir -p {_root}",
        # rulespec-us.git carries the full rules-us history; the old federal
        # pins predate the repo rename, so clone full and checkout.
        f"git clone https://github.com/TheAxiomFoundation/rulespec-us.git {_root}/rulespec-us",
        f"cd {_root}/rulespec-us && git checkout {_cfg['federal_sha']}",
        f"git clone https://github.com/TheAxiomFoundation/{_cfg['state_repo']}.git {_root}/{_cfg['state_repo']}",
        f"cd {_root}/{_cfg['state_repo']} && git checkout {_cfg['state_sha']}",
        f"{BIN_PATH} compile "
        f"--program {_root}/{_cfg['state_repo']}/{_cfg['program_rel']} "
        f"--output /opt/artifacts/{_slug}.compiled.json",
    ]

image = (
    modal.Image.debian_slim(python_version="3.13")
    .apt_install("git", "curl", "build-essential", "pkg-config", "libssl-dev", "ca-certificates")
    .run_commands(
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs "
        "| sh -s -- -y --default-toolchain stable --profile minimal",
    )
    .run_commands(
        f"echo 'engine: {ENGINE_VERSION}'",
        "git clone https://github.com/TheAxiomFoundation/axiom-rules-engine.git /opt/axiom-rules-engine",
        f"cd /opt/axiom-rules-engine && git checkout {AXIOM_RULES_ENGINE_SHA}",
        ". $HOME/.cargo/env && cd /opt/axiom-rules-engine && cargo build --release",
        "mkdir -p /opt/artifacts",
        *_clone_and_compile,
    )
    .pip_install("fastapi>=0.109", "uvicorn>=0.27", "pydantic>=2.0", "pyyaml>=6.0", "ruamel.yaml>=0.18")
    # The schemas (input slots + output IDs) are generated locally from the
    # compiled artifacts by `bun run scripts/dump-program-bases.ts` and baked
    # into the image so we don't ship a 100 KB payload on every request.
    .add_local_file(
        "engine/artifacts/co-snap-base.json",
        "/opt/co-snap-base.json",
        copy=True,
    )
    .add_local_file(
        "engine/artifacts/ny-snap-base.json",
        "/opt/ny-snap-base.json",
        copy=True,
    )
)


@app.function(
    image=image,
    scaledown_window=300,
    timeout=60,
)
@modal.concurrent(max_inputs=10)
@modal.asgi_app(label="co-snap-cliffs")
def web():
    """HTTP wrapper around axiom-rules-engine.

    POST /run         {program, request, overrides?}  → ExecutionResponse
    POST /cliff-sweep {program?, household, ...}      → SweepResult
    GET  /health      → {ok, programs, engine_version}
    """
    import hashlib
    import json
    import shutil
    import subprocess
    import tempfile
    import time
    from collections import OrderedDict
    from pathlib import Path
    from typing import Any

    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from ruamel.yaml import YAML

    # In-memory LRU result cache. Per-container; the cache survives across
    # requests as long as Modal keeps the container warm (scaledown_window).
    # 256 entries × ~5 KB = ~1.3 MB max — trivial. Slider drags that revisit
    # the same configuration return in <1 ms with no engine call.
    CACHE_MAX = 256
    cache: "OrderedDict[str, dict[str, Any]]" = OrderedDict()

    BIN = BIN_PATH
    ARTIFACTS = {slug: f"/opt/artifacts/{slug}.compiled.json" for slug in PROGRAMS}

    # Schemas baked into the image at build time. Mirror
    # src/lib/programs/<slug>-base.ts: input slots per entity (with dtype +
    # default), relations, and a map from short output names to legal ids.
    BASES: dict[str, dict[str, Any]] = {}
    for slug in PROGRAMS:
        with open(f"/opt/{slug}-base.json") as _f:
            BASES[slug] = json.load(_f)

    # Outputs surfaced per sweep point. Mirrors SURFACE_OUTPUTS in
    # src/lib/programs/registry.ts. Programs expose a subset — absent
    # names are skipped per program.
    SURFACE_OUTPUTS = [
        "snap_regular_month_allotment",
        "snap_allotment",
        "snap_maximum_allotment",
        "snap_net_income",
        "snap_eligible",
        "snap_income_eligible",
        "snap_resource_eligible",
        "gross_income",
    ]

    # Per-program request-building config. Mirrors PROGRAMS in
    # src/lib/programs/registry.ts — every TS change here must stay in sync.
    #   input_prefix: prefix for input legal ids (fragment is what matters).
    #   relations:    asserted person→household for every household member.
    #   friendly:     friendly fact → input slot binding. A string sets a
    #                 Household input; {"household"|"person": [...]} fan out.
    #   derive:       extra household overrides computed from the facts
    #                 (e.g. NY region → residency booleans).
    def _ny_region_overrides(facts: dict) -> dict:
        region = facts.get("region") or "nyc"
        return {
            "household_resides_in_new_york_city": region == "nyc",
            "household_resides_in_nassau_or_suffolk_county": region == "nassau_suffolk",
            # 18 NYCRR 387.14(a)(5)(d): the 150% FPL expanded categorical
            # path only applies to households with earned income budgeted
            # for SNAP. Derive the flag from the sweep point's earnings.
            "household_has_earned_income_budgeted_for_snap": (
                float(facts.get("monthly_earnings_per_adult") or 0) > 0
            ),
        }

    PROGRAM_CONFIG: dict[str, dict[str, Any]] = {
        "co-snap": {
            "input_prefix": "axiom:co-snap-fy-2026#input.",
            "relations": BASES["co-snap"].get(
                "relations", ["us:statutes/7/2012/j#relation.member_of_household"]
            ),
            "friendly": {
                "household_size": "household_size",
                "monthly_earnings_per_adult": "employee_wages_received",
                "monthly_unearned_income": "assistance_payments",
                "monthly_shelter_costs": "household_shelter_costs_incurred",
                "pays_separate_heating_or_cooling": (
                    "household_incurred_or_anticipated_heating_or_cooling_costs_separate_from_rent_or_mortgage"
                ),
                "liquid_resources": "liquid_resource_current_redemption_rate",
                "oldest_member_age": {"person": ["member_age"]},
                "any_member_elderly_or_disabled": {"person": ["snap_member_is_elderly_or_disabled"]},
                "primary_member_is_us_citizen": {"person": ["member_is_us_citizen"]},
            },
            "derive": None,
        },
        "ny-snap": {
            "input_prefix": BASES["ny-snap"]["input_prefix"],
            "relations": BASES["ny-snap"]["relations"],
            "friendly": {
                "household_size": "household_size",
                # NY takes both the gross and countable earned/unearned
                # figures as inputs; the demo has no exclusions, so the same
                # value feeds both slots.
                "monthly_earnings_per_adult": {
                    "household": [
                        "snap_gross_monthly_earned_income",
                        "snap_countable_earned_income",
                    ]
                },
                "monthly_unearned_income": {
                    "household": [
                        "snap_total_monthly_unearned_income",
                        "snap_countable_unearned_income",
                    ]
                },
                "monthly_shelter_costs": "household_shelter_costs_incurred",
                "pays_separate_heating_or_cooling": (
                    "household_incurred_or_anticipated_heating_or_cooling_costs_separate_from_rent_or_mortgage"
                ),
                "liquid_resources": "snap_countable_financial_resources",
                "oldest_member_age": {"person": ["member_age"]},
                "any_member_elderly_or_disabled": {"person": ["snap_member_is_elderly_or_disabled"]},
                "primary_member_is_us_citizen": {"person": ["member_is_us_citizen"]},
            },
            "derive": _ny_region_overrides,
        },
    }

    def surface_output_ids(slug: str) -> list[str]:
        by_name = BASES[slug]["outputs_by_name"]
        return [by_name[n] for n in SURFACE_OUTPUTS if n in by_name]

    def month_interval(period: str) -> tuple[dict, dict]:
        y, m = period.split("-")
        yi, mi = int(y), int(m)
        end_y = yi + 1 if mi == 12 else yi
        end_m = 1 if mi == 12 else mi + 1
        interval = {"start": f"{period}-01", "end": f"{end_y:04d}-{end_m:02d}-01"}
        return interval, {
            "period_kind": "month",
            "start": interval["start"],
            "end": interval["end"],
        }

    def to_fact_value(value, dtype: str) -> dict:
        if dtype == "bool":
            return {"kind": "bool", "value": bool(value)}
        if dtype == "integer":
            return {"kind": "integer", "value": int(round(float(value)))}
        if dtype == "decimal":
            return {"kind": "decimal", "value": str(float(value))}
        if dtype == "date":
            return {"kind": "date", "value": str(value)}
        return {"kind": "text", "value": str(value)}

    def resolve_overrides(slug: str, facts: dict) -> tuple[dict, dict]:
        """Return (household_overrides, primary_member_overrides) keyed by
        input slot name. Same logic as resolveDefaults() in registry.ts."""
        cfg = PROGRAM_CONFIG[slug]
        hh, primary = {}, {}
        for fact_key, binding in cfg["friendly"].items():
            v = facts.get(fact_key)
            if v is None:
                continue
            if isinstance(binding, str):
                hh[binding] = v
            else:
                for slot in binding.get("household") or []:
                    hh[slot] = v
                for slot in binding.get("person") or []:
                    primary[slot] = v
        if cfg["derive"]:
            hh.update(cfg["derive"](facts))
        return hh, primary

    def build_sweep_request(
        slug: str, base_facts: dict, earnings_points: list[int]
    ) -> tuple[dict, str]:
        """Port of buildSweepRequest from registry.ts. Builds N households,
        one per earnings point, and returns the full ExecutionRequest."""
        cfg = PROGRAM_CONFIG[slug]
        base = BASES[slug]
        period = base_facts.get("period") or "2026-01"
        interval, query_period = month_interval(period)
        inputs, relations, queries = [], [], []
        output_ids = surface_output_ids(slug)

        size = max(1, int(base_facts.get("household_size") or 1))
        for idx, earnings in enumerate(earnings_points):
            facts = {**base_facts, "monthly_earnings_per_adult": earnings}
            hh_over, primary_over = resolve_overrides(slug, facts)
            hh_id = f"household:{idx + 1}"
            for slot in base["household_inputs"]:
                name = slot["name"]
                v = hh_over.get(name, slot["default"])
                inputs.append(
                    {
                        "name": cfg["input_prefix"] + name,
                        "entity": "Household",
                        "entity_id": hh_id,
                        "interval": interval,
                        "value": to_fact_value(v, slot["dtype"]),
                    }
                )
            for i in range(size):
                person_id = f"person:{idx + 1}:{i + 1}"
                for relation in cfg["relations"]:
                    relations.append(
                        {
                            "name": relation,
                            "tuple": [person_id, hh_id],
                            "interval": interval,
                        }
                    )
                overrides = primary_over if i == 0 else {}
                for slot in base["person_inputs"]:
                    name = slot["name"]
                    v = overrides.get(name, slot["default"])
                    inputs.append(
                        {
                            "name": cfg["input_prefix"] + name,
                            "entity": "Person",
                            "entity_id": person_id,
                            "interval": interval,
                            "value": to_fact_value(v, slot["dtype"]),
                        }
                    )
            queries.append(
                {
                    "entity_id": hh_id,
                    "period": query_period,
                    "outputs": output_ids,
                }
            )

        return (
            {
                "mode": "explain",
                "dataset": {"inputs": inputs, "relations": relations},
                "queries": queries,
            },
            period,
        )

    def read_scalar(output: dict | None) -> float:
        if not output or output.get("kind") != "scalar":
            return 0.0
        v = output["value"]["value"]
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    def read_eligible(output: dict | None) -> bool | None:
        if not output:
            return None
        if output.get("kind") == "judgment":
            return output["outcome"] == "holds"
        return None

    def make_sweep_result(
        slug: str, engine_response: dict, earnings_points: list[int], cliff_threshold: float
    ) -> dict:
        """Port of the post-engine MTR + cliff detection from cliffs.ts."""
        outputs_by_name = BASES[slug]["outputs_by_name"]
        results = engine_response.get("results", [])
        id_of = lambda short: outputs_by_name.get(short, short)
        points = []
        for idx, r in enumerate(results):
            outs = r.get("outputs", {})
            snap_out = outs.get(id_of("snap_regular_month_allotment")) or outs.get(
                id_of("snap_allotment")
            )
            elig_out = outs.get(id_of("snap_eligible"))
            snap = read_scalar(snap_out)
            elig = read_eligible(elig_out)
            earnings = earnings_points[idx]
            points.append(
                {
                    "earnings": earnings,
                    "snap": snap,
                    "net_resources": earnings + snap,
                    "eligible": bool(elig) if elig is not None else snap > 0,
                    "mtr": None,
                    "is_cliff": False,
                }
            )

        cliff_count = 0
        max_mtr = 0.0
        for i in range(1, len(points)):
            dE = points[i]["earnings"] - points[i - 1]["earnings"]
            d_snap = points[i]["snap"] - points[i - 1]["snap"]
            if dE > 0:
                mtr = -d_snap / dE
                points[i]["mtr"] = mtr
                points[i]["is_cliff"] = mtr >= cliff_threshold
                if points[i]["is_cliff"]:
                    cliff_count += 1
                if mtr > max_mtr:
                    max_mtr = mtr

        non_first = max(1, len(points) - 1)
        summary = {
            "cliff_count": cliff_count,
            "max_mtr": max_mtr,
            "cliff_share": cliff_count / non_first,
            "total_snap_at_zero_earnings": points[0]["snap"] if points else 0,
        }
        return {"points": points, "summary": summary, "ms": 0}

    # Vercel sends override.repo as "rules-us" / "rules-us-co" / "rules-us-ny"
    # matching the dev-mode layout. Accept the canonical rulespec-* spellings
    # too. Values are the canonical scratch/tree dir names.
    REPO_CANONICAL = {
        "rules-us": "rulespec-us",
        "rules-us-co": "rulespec-us-co",
        "rules-us-ny": "rulespec-us-ny",
        "rulespec-us": "rulespec-us",
        "rulespec-us-co": "rulespec-us-co",
        "rulespec-us-ny": "rulespec-us-ny",
    }
    PROGRAM_REL_BY_SLUG = {slug: cfg["program_rel"] for slug, cfg in PROGRAMS.items()}
    STATE_REPO_BY_SLUG = {slug: cfg["state_repo"] for slug, cfg in PROGRAMS.items()}

    yaml_io = YAML()
    yaml_io.preserve_quotes = True
    yaml_io.indent(mapping=2, sequence=4, offset=2)
    yaml_io.width = 4096

    def apply_patch(rule: dict[str, Any], patch: dict[str, Any]) -> None:
        version = rule.get("versions", [None])[0]
        if version is None:
            raise ValueError(f"parameter {rule.get('name')} has no versions")
        kind = patch["kind"]
        if kind == "scale_values":
            values = version.get("values")
            if values is None:
                raise ValueError(f"parameter {rule.get('name')} has no values to scale")
            m = float(patch["multiplier"])
            for k in list(values.keys()):
                values[k] = round(values[k] * m)
        elif kind == "set_values":
            values = version.setdefault("values", {})
            for k, v in patch["values"].items():
                values[k] = v
        elif kind == "scale_formula":
            formula = version.get("formula")
            if formula is None:
                raise ValueError(f"parameter {rule.get('name')} has no formula")
            try:
                n = float(formula)
            except (TypeError, ValueError):
                raise ValueError(
                    f"scale_formula only supports numeric-literal formulas; "
                    f"{rule.get('name')} = {formula!r}"
                )
            m = float(patch["multiplier"])
            version["formula"] = f"{round(n * m * 100) / 100}"
        elif kind == "set_formula":
            version["formula"] = patch["formula"]
        else:
            raise ValueError(f"unknown patch kind: {kind!r}")

    def write_patched_tree(slug: str, overrides: list[dict[str, Any]]) -> Path:
        """Build a scratch /tmp tree with the selected program's rulespec pair
        (canonical rulespec-* names) and the relevant YAMLs patched. Returns
        the scratch root."""
        state_repo = STATE_REPO_BY_SLUG[slug]
        allowed = {"rulespec-us", state_repo}
        by_file: dict[Path, list[dict[str, Any]]] = {}
        scratch = Path(tempfile.mkdtemp(prefix=f"{slug}-overrides-"))
        # Symlinks would be faster but the engine canonicalizes paths during
        # ancestor traversal for imports — a full copy of both repos (~1.3 MB)
        # is cheap (<50 ms) and avoids that landmine.
        src_root = Path(f"/opt/programs/{slug}")
        for src_name in ("rulespec-us", state_repo):
            shutil.copytree(src_root / src_name, scratch / src_name)

        for ov in overrides:
            repo = ov["repo"]
            canonical = REPO_CANONICAL.get(repo)
            if canonical is None:
                raise HTTPException(400, f"unknown override repo: {repo!r}")
            if canonical not in allowed:
                raise HTTPException(
                    400,
                    f"override repo {repo!r} is not valid for program {slug!r} "
                    f"(allowed: {sorted(allowed)})",
                )
            file = scratch / canonical / ov["file_relative"]
            by_file.setdefault(file, []).append(ov)

        for file, file_overrides in by_file.items():
            if not file.exists():
                raise HTTPException(400, f"override target not found: {file}")
            with file.open("r") as f:
                doc = yaml_io.load(f)
            if doc is None or "rules" not in doc:
                raise HTTPException(400, f"no rules array in {file}")
            for ov in file_overrides:
                rule = next(
                    (r for r in doc["rules"] if r.get("name") == ov["parameter"]),
                    None,
                )
                if rule is None:
                    raise HTTPException(
                        400,
                        f"parameter {ov['parameter']} not found in {file}",
                    )
                if rule.get("kind") != "parameter":
                    raise HTTPException(
                        400,
                        f"rule {ov['parameter']} in {file} is kind={rule.get('kind')}, not parameter",
                    )
                apply_patch(rule, ov["patch"])
            with file.open("w") as f:
                yaml_io.dump(doc, f)
        return scratch

    def run_engine(args: list[str], stdin_text: str) -> dict[str, Any]:
        proc = subprocess.run(
            args,
            input=stdin_text,
            text=True,
            capture_output=True,
            timeout=45,
        )
        if proc.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"axiom-rules-engine exited {proc.returncode}: {proc.stderr.strip()}",
            )
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as err:
            raise HTTPException(
                status_code=500, detail=f"could not parse engine output: {err}"
            )

    def run_with_overrides(
        slug: str, overrides: list[dict[str, Any]], engine_request: dict
    ) -> dict[str, Any]:
        """Patch + compile + run for one request; cleans up the scratch tree."""
        scratch = write_patched_tree(slug, overrides)
        try:
            program_yaml = scratch / STATE_REPO_BY_SLUG[slug] / PROGRAM_REL_BY_SLUG[slug]
            artifact = scratch / f"{slug}.compiled.json"
            compile_proc = subprocess.run(
                [BIN, "compile", "--program", str(program_yaml), "--output", str(artifact)],
                text=True,
                capture_output=True,
                timeout=30,
            )
            if compile_proc.returncode != 0:
                raise HTTPException(
                    500,
                    f"compile failed ({compile_proc.returncode}): "
                    f"{compile_proc.stderr.strip()}",
                )
            return run_engine(
                [BIN, "run-compiled", "--artifact", str(artifact)],
                json.dumps(engine_request),
            )
        finally:
            shutil.rmtree(scratch, ignore_errors=True)

    api = FastAPI(title="co-snap-cliffs engine", version="0.2.0")

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @api.get("/health")
    async def health():
        return {
            "ok": Path(BIN).exists(),
            "binary": BIN,
            "programs": {
                slug: {"artifact": path, "exists": Path(path).exists()}
                for slug, path in ARTIFACTS.items()
            },
            "default_program": DEFAULT_PROGRAM,
            "engine_version": ENGINE_VERSION,
        }

    def cache_key(program: str, engine_request: dict, overrides: list) -> str:
        # Canonical JSON so dict-key ordering doesn't matter.
        material = json.dumps(
            {"p": program, "r": engine_request, "o": overrides},
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    @api.post("/run")
    async def run(request: Request):
        body = await request.json()
        program = body.get("program") or DEFAULT_PROGRAM
        engine_request = body.get("request")
        overrides = body.get("overrides") or []
        if program not in ARTIFACTS:
            raise HTTPException(
                400, f"unknown program: {program!r}; known: {list(ARTIFACTS)}"
            )
        if not isinstance(engine_request, dict):
            raise HTTPException(400, "missing or invalid `request` body")

        key = cache_key(program, engine_request, overrides)
        hit = cache.get(key)
        if hit is not None:
            cache.move_to_end(key)
            return hit

        if not overrides:
            result = run_engine(
                [BIN, "run-compiled", "--artifact", ARTIFACTS[program]],
                json.dumps(engine_request),
            )
        else:
            result = run_with_overrides(program, overrides, engine_request)

        cache[key] = result
        if len(cache) > CACHE_MAX:
            cache.popitem(last=False)
        return result

    @api.post("/cliff-sweep")
    async def cliff_sweep(request: Request):
        """Thin-payload endpoint. Takes ~150 bytes instead of ~100 KB,
        builds the engine request server-side, runs the engine (with
        overrides if supplied), computes MTR + cliff metrics, and returns
        the SweepResult that lib/cliffs.ts used to assemble on Vercel."""
        body = await request.json()
        program = body.get("program") or DEFAULT_PROGRAM
        household = body.get("household") or {}
        earnings_min = int(body.get("earnings_min") or 0)
        earnings_max = int(body.get("earnings_max") or 4000)
        earnings_step = int(body.get("earnings_step") or 100)
        cliff_threshold = float(body.get("cliff_mtr_threshold") or 1.0)
        overrides = body.get("overrides") or []
        if program not in ARTIFACTS:
            raise HTTPException(
                400, f"unknown program: {program!r}; known: {list(ARTIFACTS)}"
            )
        if earnings_step < 1:
            raise HTTPException(400, "earnings_step must be >= 1")

        # Cache on the thin-payload shape so two clients with identical
        # sliders get the same cached result, even if they entered it
        # through different paths.
        cache_material = {
            "program": program,
            "household": household,
            "range": [earnings_min, earnings_max, earnings_step],
            "overrides": overrides,
            "threshold": cliff_threshold,
        }
        key = "sweep:" + hashlib.sha256(
            json.dumps(cache_material, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        hit = cache.get(key)
        if hit is not None:
            cache.move_to_end(key)
            return hit

        earnings_points = list(range(earnings_min, earnings_max + 1, earnings_step))
        engine_request, _period = build_sweep_request(program, household, earnings_points)

        start_ms = int(time.monotonic() * 1000)
        if not overrides:
            engine_response = run_engine(
                [BIN, "run-compiled", "--artifact", ARTIFACTS[program]],
                json.dumps(engine_request),
            )
        else:
            engine_response = run_with_overrides(program, overrides, engine_request)

        result = make_sweep_result(program, engine_response, earnings_points, cliff_threshold)
        result["ms"] = int(time.monotonic() * 1000) - start_ms

        cache[key] = result
        if len(cache) > CACHE_MAX:
            cache.popitem(last=False)
        return result

    return api


# Scheduled function that pings the web app every 4 minutes. Modal's
# scaledown_window is 5 min, so this keeps the container warm indefinitely
# without paying for a min_containers=1 reservation.
@app.function(
    image=image,
    schedule=modal.Period(minutes=4),
    timeout=30,
)
def keepwarm() -> dict:
    import urllib.request

    url = "https://policyengine--co-snap-cliffs.modal.run/health"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            return {"status": resp.status, "ok": True}
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "error": str(err)}
