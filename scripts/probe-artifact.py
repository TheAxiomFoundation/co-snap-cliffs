#!/usr/bin/env python3
"""Check that a compiled artifact accepts a program base schema's full input
set. Builds a one-household default request from <slug>-base.json and runs it
through `run-compiled`; exits non-zero if the engine rejects any input or
output id.

The base modules (src/lib/programs/<slug>-base.ts and their JSON dumps) are
generated against specific rulespec trees. If the local checkouts drift, a
fresh compile may drop or rename input slots — this probe catches that before
an incompatible artifact lands in engine/artifacts/.

Usage:
  python3 scripts/probe-artifact.py \
    --base engine/artifacts/ny-snap-base.json \
    --artifact engine/artifacts/ny-snap.compiled.json.tmp \
    --engine engine/axiom-rules-engine/target/release/axiom-rules-engine
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys

INTERVAL = {"start": "2026-01-01", "end": "2026-02-01"}
PERIOD = {"period_kind": "month", **INTERVAL}


def fact(value, dtype: str) -> dict:
    if dtype == "bool":
        return {"kind": "bool", "value": bool(value)}
    if dtype == "integer":
        return {"kind": "integer", "value": int(round(float(value)))}
    if dtype == "decimal":
        return {"kind": "decimal", "value": str(float(value))}
    if dtype == "date":
        return {"kind": "date", "value": str(value)}
    return {"kind": "text", "value": str(value)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--artifact", required=True)
    ap.add_argument("--engine", required=True)
    args = ap.parse_args()

    base = json.loads(open(args.base).read())
    prefix = base.get("input_prefix", f"axiom:{base['schema'].replace('.', '-')}#input.")

    inputs, relations = [], []
    for slot in base["household_inputs"]:
        inputs.append(
            {
                "name": prefix + slot["name"],
                "entity": "Household",
                "entity_id": "h0",
                "interval": INTERVAL,
                "value": fact(slot["default"], slot["dtype"]),
            }
        )
    for relation in base.get("relations", []):
        relations.append({"name": relation, "tuple": ["p0", "h0"], "interval": INTERVAL})
    for slot in base["person_inputs"]:
        inputs.append(
            {
                "name": prefix + slot["name"],
                "entity": "Person",
                "entity_id": "p0",
                "interval": INTERVAL,
                "value": fact(slot["default"], slot["dtype"]),
            }
        )

    # outputs_by_name is a plain {short_name: legal_id} map in every base;
    # all_outputs differs in shape between generations (strings vs objects).
    output_ids = sorted(set(base["outputs_by_name"].values()))
    request = {
        "mode": "fast",
        "dataset": {"inputs": inputs, "relations": relations},
        "queries": [{"entity_id": "h0", "period": PERIOD, "outputs": output_ids}],
    }
    proc = subprocess.run(
        [args.engine, "run-compiled", "--artifact", args.artifact],
        input=json.dumps(request).encode(),
        capture_output=True,
    )
    if proc.returncode != 0:
        sys.stderr.write(
            f"artifact {args.artifact} is incompatible with {args.base}:\n"
            f"{proc.stderr.decode()[:500]}\n"
        )
        return 1
    print(f"probe ok: {args.artifact} accepts all {len(inputs)} inputs from {args.base}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
