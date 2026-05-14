"""Modal deployment for co-snap-cliffs.

Hosts the ``axiom-rules-engine`` Rust binary plus the rulespec-us and
rulespec-us-co trees, exposed as a single HTTP service the Vercel app calls.

Two execution paths share the same wire shape (``POST /run``):

1. No parameter overrides → run the prebuilt ``co-snap.compiled.json``
   artifact baked into the image. Fast (no compile).
2. Parameter overrides supplied → patch the in-image rulespec YAMLs
   in a per-request scratch tree, compile, run. Adds ~70 ms.

The Vercel-hosted Next.js app proxies ``/api/cliff-sweep`` here; see
``src/lib/engine/run.ts``.

Deploy:
    modal deploy modal_app.py

First deploy compiles Rust (~3-4 min); subsequent deploys reuse the cached
layer unless ``ENGINE_VERSION`` changes.

Deployed URL prints as ``https://policyengine--co-snap-cliffs-web.modal.run``;
set that as ``AXIOM_ENGINE_URL`` on the Vercel project.
"""

import modal

app = modal.App("co-snap-cliffs")

ENGINE_VERSION = "v4-thin-payload"

# Pinned commit SHAs. Match finbot-snap-demo so the compiled-artifact input
# slots line up with src/lib/programs/co-snap-base.ts (auto-generated from
# the artifact). Bump together and re-generate co-snap-base.ts when upgrading.
AXIOM_RULES_ENGINE_SHA = "9106f44e34ec3eae92a1adf2246560c5eac00094"
RULESPEC_US_SHA = "2f3a30991e1f8279c2fa664e51f068a63d905591"
RULESPEC_US_CO_SHA = "ba00673d73c19f262d542cfa597b0b365a1313b7"

PROGRAMS = [
    ("co-snap", "rules-us-co/policies/cdhs/snap/fy-2026-benefit-calculation.yaml"),
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
        # Engine at this SHA looks for sibling dirs named `rules-{prefix}`
        # via ancestor traversal — see candidate_rule_repo_roots in
        # axiom-rules-engine/src/rulespec.rs. Clone to those names, not
        # `rulespec-*`, or imports fail to resolve at compile time.
        "git clone https://github.com/TheAxiomFoundation/rulespec-us.git /opt/rules-us",
        f"cd /opt/rules-us && git checkout {RULESPEC_US_SHA}",
        "git clone https://github.com/TheAxiomFoundation/rulespec-us-co.git /opt/rules-us-co",
        f"cd /opt/rules-us-co && git checkout {RULESPEC_US_CO_SHA}",
        ". $HOME/.cargo/env && cd /opt/axiom-rules-engine && cargo build --release",
        "mkdir -p /opt/artifacts",
        *[
            f"/opt/axiom-rules-engine/target/release/axiom-rules compile "
            f"--program /opt/{path} "
            f"--output /opt/artifacts/{slug}.compiled.json"
            for slug, path in PROGRAMS
        ],
    )
    .pip_install("fastapi>=0.109", "uvicorn>=0.27", "pydantic>=2.0", "pyyaml>=6.0", "ruamel.yaml>=0.18")
    # The schema (input slots + output IDs) is generated locally from the
    # compiled artifact by `bun run scripts/dump-co-snap-base.ts` and baked
    # into the image so we don't ship a 100 KB payload on every request.
    .add_local_file(
        "engine/artifacts/co-snap-base.json",
        "/opt/co-snap-base.json",
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

    POST /run    {program, request, overrides?}  → ExecutionResponse
    GET  /health → {ok, programs, engine_version}
    """
    import hashlib
    import json
    import re
    import shutil
    import subprocess
    import tempfile
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

    BIN = "/opt/axiom-rules-engine/target/release/axiom-rules"
    ARTIFACTS = {slug: f"/opt/artifacts/{slug}.compiled.json" for slug, _ in PROGRAMS}

    # Schema baked into the image at build time. Mirrors src/lib/programs/
    # co-snap-base.ts: input slots per entity (with dtype + default), and a
    # map from short output names to legal RuleSpec IDs.
    with open("/opt/co-snap-base.json") as _f:
        CO_SNAP_BASE = json.load(_f)
    HOUSEHOLD_INPUTS = CO_SNAP_BASE["household_inputs"]
    PERSON_INPUTS = CO_SNAP_BASE["person_inputs"]
    OUTPUTS_BY_NAME = CO_SNAP_BASE["outputs_by_name"]
    # Outputs surfaced per sweep point. Mirrors SURFACE_OUTPUTS in co-snap.ts.
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
    SURFACE_OUTPUT_IDS = [OUTPUTS_BY_NAME.get(n, n) for n in SURFACE_OUTPUTS]
    RELATION_MEMBER_OF_HOUSEHOLD = (
        "us:statutes/7/2012/j#relation.member_of_household"
    )
    SYNTHETIC_INPUT_PREFIX = "axiom:co-snap-fy-2026#input."

    # Friendly fact → input slot mapping. Mirrors FRIENDLY_TO_SLOT in
    # co-snap.ts. `None` = handled separately (period); a string sets a
    # Household input; a {"person": [...]} sets a Person input on the
    # primary member.
    FRIENDLY_TO_SLOT: dict[str, Any] = {
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
    }

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

    def resolve_overrides(facts: dict) -> tuple[dict, dict]:
        """Return (household_overrides, primary_member_overrides) keyed by
        input slot name. Same logic as resolveDefaults() in co-snap.ts."""
        hh, primary = {}, {}
        for fact_key, binding in FRIENDLY_TO_SLOT.items():
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
        return hh, primary

    def build_sweep_request(
        base_facts: dict, earnings_points: list[int]
    ) -> tuple[dict, str]:
        """Port of buildSweepRequest from co-snap.ts. Builds N households, one
        per earnings point, and returns the full ExecutionRequest."""
        period = base_facts.get("period") or "2026-01"
        interval, query_period = month_interval(period)
        inputs, relations, queries = [], [], []

        size = max(1, int(base_facts.get("household_size") or 1))
        for idx, earnings in enumerate(earnings_points):
            facts = {**base_facts, "monthly_earnings_per_adult": earnings}
            hh_over, primary_over = resolve_overrides(facts)
            hh_id = f"household:{idx + 1}"
            for slot in HOUSEHOLD_INPUTS:
                name = slot["name"]
                v = hh_over.get(name, slot["default"])
                inputs.append(
                    {
                        "name": SYNTHETIC_INPUT_PREFIX + name,
                        "entity": "Household",
                        "entity_id": hh_id,
                        "interval": interval,
                        "value": to_fact_value(v, slot["dtype"]),
                    }
                )
            for i in range(size):
                person_id = f"person:{idx + 1}:{i + 1}"
                relations.append(
                    {
                        "name": RELATION_MEMBER_OF_HOUSEHOLD,
                        "tuple": [person_id, hh_id],
                        "interval": interval,
                    }
                )
                overrides = primary_over if i == 0 else {}
                for slot in PERSON_INPUTS:
                    name = slot["name"]
                    v = overrides.get(name, slot["default"])
                    inputs.append(
                        {
                            "name": SYNTHETIC_INPUT_PREFIX + name,
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
                    "outputs": SURFACE_OUTPUT_IDS,
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
        engine_response: dict, earnings_points: list[int], cliff_threshold: float
    ) -> dict:
        """Port of the post-engine MTR + cliff detection from cliffs.ts."""
        results = engine_response.get("results", [])
        id_of = lambda short: OUTPUTS_BY_NAME.get(short, short)
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
    # Vercel sends override.repo as "rules-us" / "rules-us-co" matching the
    # dev-mode layout. Accept either spelling.
    REPO_DIR = {
        "rules-us": "/opt/rules-us",
        "rules-us-co": "/opt/rules-us-co",
        "rulespec-us": "/opt/rules-us",
        "rulespec-us-co": "/opt/rules-us-co",
    }
    PROGRAM_REL_BY_SLUG = {slug: rel for slug, rel in PROGRAMS}

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

    def write_patched_tree(overrides: list[dict[str, Any]]) -> Path:
        """Build a scratch /tmp tree mirroring the on-image layout, with the
        relevant YAMLs patched. Returns the scratch root."""
        scratch = Path(tempfile.mkdtemp(prefix="co-snap-overrides-"))
        # Symlinks would be faster but the engine canonicalizes paths during
        # ancestor traversal for imports — a full copy of both repos (~1.3 MB)
        # is cheap (<50 ms) and avoids that landmine.
        for src_name in ("rules-us", "rules-us-co"):
            shutil.copytree(f"/opt/{src_name}", scratch / src_name)

        by_file: dict[Path, list[dict[str, Any]]] = {}
        for ov in overrides:
            repo = ov["repo"]
            if repo not in REPO_DIR:
                raise HTTPException(400, f"unknown override repo: {repo!r}")
            scratch_repo = "rules-us-co" if "us-co" in repo else "rules-us"
            file = scratch / scratch_repo / ov["file_relative"]
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

    api = FastAPI(title="co-snap-cliffs engine", version="0.1.0")

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
        program = body.get("program")
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
            scratch = write_patched_tree(overrides)
            try:
                program_yaml = scratch / PROGRAM_REL_BY_SLUG[program]
                artifact = scratch / f"{program}.compiled.json"
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
                result = run_engine(
                    [BIN, "run-compiled", "--artifact", str(artifact)],
                    json.dumps(engine_request),
                )
            finally:
                shutil.rmtree(scratch, ignore_errors=True)

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
        program = body.get("program", "co-snap")
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
        engine_request, _period = build_sweep_request(household, earnings_points)

        start_ms = int(__import__("time").monotonic() * 1000)
        if not overrides:
            engine_response = run_engine(
                [BIN, "run-compiled", "--artifact", ARTIFACTS[program]],
                json.dumps(engine_request),
            )
        else:
            scratch = write_patched_tree(overrides)
            try:
                program_yaml = scratch / PROGRAM_REL_BY_SLUG[program]
                artifact = scratch / f"{program}.compiled.json"
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
                engine_response = run_engine(
                    [BIN, "run-compiled", "--artifact", str(artifact)],
                    json.dumps(engine_request),
                )
            finally:
                shutil.rmtree(scratch, ignore_errors=True)

        result = make_sweep_result(engine_response, earnings_points, cliff_threshold)
        result["ms"] = int(__import__("time").monotonic() * 1000) - start_ms

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
