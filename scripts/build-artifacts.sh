#!/usr/bin/env bash
# Compile RuleSpec programs to JSON artifacts under engine/artifacts/.
# Add another program by appending another compile call.
set -euo pipefail

cd "$(dirname "$0")/.."
BIN="engine/axiom-rules-engine/target/release/axiom-rules-engine"
mkdir -p engine/artifacts

if [ ! -x "$BIN" ]; then
  echo "binary missing: $BIN — run scripts/setup-engine.sh first" >&2
  exit 1
fi

# Programs are staged under the canonical rulespec-* names before compiling:
# the engine resolves `us:` / `us-ny:` / `us-co:` imports by looking for
# `rulespec-{prefix}` sibling dirs (after resolving symlinks), and derives the
# state-prefixed legal ids in the artifact from the rulespec-* path component.
compile_staged() {
  local slug="$1" state_repo="$2" program_rel="$3"
  echo "==> compiling $slug (staged as rulespec-us + rulespec-${state_repo#rules-})"
  local stage
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' RETURN
  cp -RL engine/rules-us "$stage/rulespec-us"
  cp -RL "engine/${state_repo}" "$stage/rulespec-${state_repo#rules-}"
  "$BIN" compile \
    --program "$stage/rulespec-${state_repo#rules-}/${program_rel}" \
    --output "engine/artifacts/${slug}.compiled.json.tmp" >/dev/null
}

# Each base module (src/lib/programs/<slug>-base.ts) is generated against
# specific rulespec trees — the pins are recorded in modal_app.py. If the
# local engine/rules-us* checkouts have drifted past those pins, a fresh
# compile can drop input slots the base still sends. Probe the candidate
# artifact against the base's full input set and only install it if it's
# compatible; otherwise keep the existing artifact.
install_if_compatible() {
  local slug="$1"
  if python3 scripts/probe-artifact.py \
    --base "engine/artifacts/${slug}-base.json" \
    --artifact "engine/artifacts/${slug}.compiled.json.tmp" \
    --engine "$BIN"; then
    mv "engine/artifacts/${slug}.compiled.json.tmp" "engine/artifacts/${slug}.compiled.json"
  else
    rm -f "engine/artifacts/${slug}.compiled.json.tmp"
    echo "WARN: fresh ${slug} artifact is incompatible with ${slug}-base — keeping the existing artifact" >&2
    echo "      (local rulespec checkouts likely drifted from the pins in modal_app.py;" >&2
    echo "       regenerate the base via scripts/generate-program-base.py to move forward)" >&2
  fi
}

if compile_staged co-snap rules-us-co policies/cdhs/snap/fy-2026-benefit-calculation.yaml; then
  install_if_compatible co-snap
else
  echo "WARN: co-snap compile failed; keeping the existing artifact" >&2
fi

compile_staged ny-snap rules-us-ny policies/otda/snap/fy-2026-benefit-calculation.yaml
install_if_compatible ny-snap

# Re-emit the schemas as JSON for Modal to consume. Cheap (sub-second).
echo "==> dumping program base JSONs"
bun run scripts/dump-program-bases.ts

echo "==> artifacts:"
ls -lh engine/artifacts/
