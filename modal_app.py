"""Modal deployment for the multi-state cliff explorer (co-snap + ny-snap).

Hosts the ``axiom-rules-engine`` Rust binary plus per-program rulespec trees,
exposed as a single HTTP service the Vercel app calls. The service itself
lives in ``engine_service.py`` (see its docstring for the two execution
paths and why overrides compile in place); this file builds the image and
serves it.

The Vercel-hosted Next.js app proxies ``/api/cliff-sweep`` here; see
``src/lib/cliffs.ts``.

Program layout: each program gets its own pinned pair of trees under
``/opt/programs/<slug>/`` using the canonical ``rulespec-*`` dir names the
engine's import resolution expects — ``rulespec-us`` (federal) next to
``rulespec-us-co`` / ``rulespec-us-ny`` (state). Pins live in
``engine_pins.py``. The trees ship without ``.git``: nothing reads it, and
it was 22 MB of every tree.

Deploy (needs engine/artifacts/<slug>-base.json; see DEPLOY.md):
    bun run scripts/dump-program-bases.ts
    modal deploy modal_app.py

A rebuild of the engine layer compiles Rust (~3-4 min); bumping only
``TREES_VERSION`` or a rulespec pin rebuilds just the trees layer.

Deployed URL prints as ``https://policyengine--co-snap-cliffs.modal.run``;
set that as ``AXIOM_ENGINE_URL`` on the Vercel project.
"""

import modal

from engine_pins import AXIOM_RULES_ENGINE_SHA, DEFAULT_PROGRAM, PROGRAMS

app = modal.App("co-snap-cliffs")

# Reported by /health; bump to force a rebuild of the trees layer.
TREES_VERSION = "v6-in-place-overrides"

BIN_PATH = "/opt/axiom-rules-engine/target/release/axiom-rules-engine"

_clone_and_compile = []
for _slug, _cfg in PROGRAMS.items():
    _root = f"/opt/programs/{_slug}"
    _clone_and_compile += [
        f"mkdir -p {_root}",
        # rulespec-us.git carries the full rules-us history; the old federal
        # pins predate the repo rename, so clone full and checkout.
        f"git clone https://github.com/TheAxiomFoundation/rulespec-us.git {_root}/rulespec-us",
        f"cd {_root}/rulespec-us && git checkout {_cfg['federal_sha']} && rm -rf .git",
        f"git clone https://github.com/TheAxiomFoundation/{_cfg['state_repo']}.git {_root}/{_cfg['state_repo']}",
        f"cd {_root}/{_cfg['state_repo']} && git checkout {_cfg['state_sha']} && rm -rf .git",
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
    # Engine layer.
    .run_commands(
        f"echo 'engine: {AXIOM_RULES_ENGINE_SHA}'",
        "git clone https://github.com/TheAxiomFoundation/axiom-rules-engine.git /opt/axiom-rules-engine",
        f"cd /opt/axiom-rules-engine && git checkout {AXIOM_RULES_ENGINE_SHA}",
        ". $HOME/.cargo/env && cd /opt/axiom-rules-engine && cargo build --release",
    )
    # Trees layer: pinned rulespec pairs plus each program's prebuilt
    # baseline artifact.
    .run_commands(
        f"echo 'trees: {TREES_VERSION}'",
        "mkdir -p /opt/artifacts",
        *_clone_and_compile,
    )
    # Keep in step with pyproject.toml.
    .pip_install("fastapi>=0.109", "uvicorn>=0.27", "pydantic>=2.0", "ruamel.yaml>=0.18")
    # The schemas (input slots + output IDs) are generated locally from the
    # TS base modules by `bun run scripts/dump-program-bases.ts` and baked
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
    .add_local_python_source("engine_pins", "engine_service")
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
    from pathlib import Path

    from engine_service import ServiceConfig, create_app

    return create_app(
        ServiceConfig(
            bin_path=BIN_PATH,
            programs=PROGRAMS,
            programs_root=Path("/opt/programs"),
            artifacts_dir=Path("/opt/artifacts"),
            bases_dir=Path("/opt"),
            default_program=DEFAULT_PROGRAM,
            engine_version=TREES_VERSION,
        )
    )
