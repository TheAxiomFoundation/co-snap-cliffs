#!/usr/bin/env bash
# Clone the axiom rule engine + rulespec repos under ./engine/, build the
# release binary, and compile the CO SNAP artifact. Idempotent.
#
# Fast path: if `~/finbot-snap-demo/engine/` exists with an already-built
# binary and rulespec clones, symlink to it instead of re-cloning + rebuilding.
# Saves ~3-4 minutes for anyone who already has finbot-snap-demo set up.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p engine engine/artifacts

FINBOT_ENGINE="${HOME}/finbot-snap-demo/engine"

if [ -d "${FINBOT_ENGINE}/axiom-rules" ] && [ -x "${FINBOT_ENGINE}/axiom-rules/target/release/axiom-rules" ]; then
  echo "==> dev fast path: symlinking from ${FINBOT_ENGINE}"
  ln -snf "${FINBOT_ENGINE}/axiom-rules" engine/axiom-rules-engine
  ln -snf "${FINBOT_ENGINE}/rules-us" engine/rules-us
  ln -snf "${FINBOT_ENGINE}/rules-us-co" engine/rules-us-co
  # Alias the binary to the canonical name the runtime expects.
  ln -sf axiom-rules engine/axiom-rules-engine/target/release/axiom-rules-engine
else
  clone_or_pull() {
    local repo="$1" dest="engine/$1"
    if [ -d "$dest/.git" ]; then
      echo "==> updating $repo"
      git -C "$dest" pull --ff-only
    else
      echo "==> cloning $repo"
      git clone --depth 1 "https://github.com/TheAxiomFoundation/$repo.git" "$dest"
    fi
  }
  # Note: upstream finbot-snap-demo uses an older engine that expects dirs
  # named `rules-us` / `rules-us-co`. The newer rule engine expects
  # `rulespec-us` / `rulespec-us-co`. We pin to the older naming for now to
  # match the finbot binary we depend on; flip these names when we upgrade the
  # engine.
  clone_or_pull axiom-rules-engine
  clone_or_pull rules-us
  clone_or_pull rules-us-co

  if ! command -v cargo >/dev/null; then
    echo "cargo not found — install Rust first: https://rustup.rs" >&2
    exit 1
  fi
  echo "==> building axiom-rules-engine (release; ~3-4 min on first run)"
  ( cd engine/axiom-rules-engine && cargo build --release )
fi

bash scripts/build-artifacts.sh
echo "==> done."
