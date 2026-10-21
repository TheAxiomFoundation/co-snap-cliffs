#!/usr/bin/env python3
"""Build the engine service's real-engine layout locally (or in CI).

Mirrors what modal_app.py bakes into the Modal image, from the same pins
(engine_pins.py):

    <dest>/bin/axiom-rules-engine             (release build of the pinned engine)
    <dest>/programs/<slug>/rulespec-us        (federal tree, no .git)
    <dest>/programs/<slug>/<state repo>       (state tree, no .git)
    <dest>/artifacts/<slug>.compiled.json     (prebuilt baseline artifact)

tests/test_engine_service_real.py runs against it when
CO_SNAP_SERVICE_FIXTURE=<dest> is set. Idempotent: a binary or tree already
at the pinned commit is reused, so CI can cache <dest>/bin alone.

Usage: python3 scripts/setup-service-fixture.py <dest>
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import engine_pins  # noqa: E402

ORG = "https://github.com/TheAxiomFoundation"


def run(*args: str, cwd: Path | None = None) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run(args, cwd=cwd, check=True)


def checkout(repo: str, sha: str, dest: Path) -> None:
    """Fetch ``repo`` at ``sha`` into ``dest`` without ``.git``, as the Modal
    image has it. A ``.pinned`` stamp records the commit so reruns skip trees
    that are already at it."""
    stamp = dest / ".pinned"
    if stamp.exists() and stamp.read_text().strip() == sha:
        return
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    run("git", "init", "-q", cwd=dest)
    run("git", "remote", "add", "origin", f"{ORG}/{repo}.git", cwd=dest)
    run("git", "fetch", "-q", "--depth", "1", "origin", sha, cwd=dest)
    run("git", "checkout", "-q", "FETCH_HEAD", cwd=dest)
    shutil.rmtree(dest / ".git")
    stamp.write_text(sha + "\n")


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    dest = Path(sys.argv[1]).resolve()

    sha = engine_pins.AXIOM_RULES_ENGINE_SHA
    binary = dest / "bin/axiom-rules-engine"
    stamp = dest / "bin/.pinned"
    if not (binary.exists() and stamp.exists() and stamp.read_text().strip() == sha):
        engine = dest / "axiom-rules-engine"
        checkout("axiom-rules-engine", sha, engine)
        run("cargo", "build", "--release", "--jobs", "4", cwd=engine)
        binary.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(engine / "target/release/axiom-rules-engine", binary)
        stamp.write_text(sha + "\n")

    artifacts = dest / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    for slug, cfg in engine_pins.PROGRAMS.items():
        root = dest / "programs" / slug
        checkout("rulespec-us", cfg["federal_sha"], root / "rulespec-us")
        checkout(cfg["state_repo"], cfg["state_sha"], root / cfg["state_repo"])
        run(
            str(binary),
            "compile",
            "--program",
            str(root / cfg["state_repo"] / cfg["program_rel"]),
            "--output",
            str(artifacts / f"{slug}.compiled.json"),
        )
    print(f"fixture ready: {dest}")


if __name__ == "__main__":
    main()
