#!/usr/bin/env bash
# Compile RuleSpec programs to JSON artifacts under engine/artifacts/.
# Add another program by appending another `compile` call.
set -euo pipefail

cd "$(dirname "$0")/.."
BIN="engine/axiom-rules-engine/target/release/axiom-rules-engine"
mkdir -p engine/artifacts

if [ ! -x "$BIN" ]; then
  echo "binary missing: $BIN — run scripts/setup-engine.sh first" >&2
  exit 1
fi

compile() {
  local slug="$1" rulespec="$2"
  echo "==> compiling $slug"
  "$BIN" compile --program "$rulespec" --output "engine/artifacts/${slug}.compiled.json" >/dev/null
}

compile co-snap engine/rules-us-co/policies/cdhs/snap/fy-2026-benefit-calculation.yaml

# Re-emit the schema as JSON for Modal to consume. Cheap (sub-second).
echo "==> dumping co-snap-base.json"
bun run scripts/dump-co-snap-base.ts

echo "==> artifacts:"
ls -lh engine/artifacts/
