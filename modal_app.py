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

ENGINE_VERSION = "v2-correct-binary-name"

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
    import json
    import re
    import shutil
    import subprocess
    import tempfile
    from pathlib import Path
    from typing import Any

    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from ruamel.yaml import YAML

    BIN = "/opt/axiom-rules-engine/target/release/axiom-rules"
    ARTIFACTS = {slug: f"/opt/artifacts/{slug}.compiled.json" for slug, _ in PROGRAMS}
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

        if not overrides:
            return run_engine(
                [BIN, "run-compiled", "--artifact", ARTIFACTS[program]],
                json.dumps(engine_request),
            )

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
            return run_engine(
                [BIN, "run-compiled", "--artifact", str(artifact)],
                json.dumps(engine_request),
            )
        finally:
            shutil.rmtree(scratch, ignore_errors=True)

    return api
