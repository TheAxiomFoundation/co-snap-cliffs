#!/usr/bin/env python3
"""Generate a <slug>-base.json schema for a compiled program.

The engine demands every input slot be supplied — there is no implicit
compiled default — so the demo needs a full {name, dtype, default} list
per entity. The compiled artifact does not declare inputs; this script
recovers them by iterating `run-compiled` on a one-household probe and
reading the engine's "missing input `X` for entity `pN|hN`" errors,
which yield both the slot name and its entity. Dtypes/defaults come
from a donor base (co-snap-base.json) for shared slot names and from
name heuristics for the rest; a final successful engine run verifies
the whole set.

Usage:
  python3 scripts/generate-program-base.py \
    --slug ny-snap --schema ny-snap.fy-2026 \
    --artifact engine/artifacts/ny-snap.compiled.json \
    --donor engine/artifacts/co-snap-base.json \
    --engine engine/axiom-rules-engine/target/release/axiom-rules-engine \
    --out engine/artifacts/ny-snap-base.json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

MISSING_RE = re.compile(r"missing input `([^`]+)` for entity `([ph])0`")

MONEY_HINTS = (
    "income", "wages", "amount", "cost", "costs", "payment", "payments",
    "deduction", "expenses", "grant", "benefit_level", "resources",
    "redemption_rate", "allotment", "wage", "earnings",
)
DECIMAL_HINTS = ("factor", "ratio", "share")
INT_HINTS = ("size", "age", "months", "hours", "count", "number")
DATE_HINTS = ("_date",)


PREDICATE_HINTS = (
    "_has_", "_is_", "_was_", "_are_", "receives_", "authorized_",
    "determined_", "entitled_", "eligible", "exempt", "applies",
    "resides_", "enrolled_", "billed_", "incurred_or_anticipated_",
    "claimed_", "refused_", "failed_", "disqualified", "certified_",
    "unable_", "covered_", "paid_", "suspended", "pending", "missing",
)


def guess(name: str) -> tuple[str, object]:
    n = name.lower()
    if any(h in n for h in DATE_HINTS):
        return "date", "2026-01-01"
    if any(h in n for h in PREDICATE_HINTS) or n.startswith(("has_", "is_")):
        return "bool", False
    if any(h in n for h in DECIMAL_HINTS):
        return "decimal", 1.0
    if any(h in n for h in INT_HINTS):
        return "integer", 0
    if any(h in n for h in MONEY_HINTS):
        return "integer", 0
    return "bool", False


def scalar(dtype: str, value) -> dict:
    if dtype == "bool":
        return {"kind": "bool", "value": bool(value)}
    if dtype == "integer":
        return {"kind": "integer", "value": int(value)}
    if dtype == "decimal":
        return {"kind": "decimal", "value": f"{float(value):.6f}"}
    if dtype == "date":
        return {"kind": "date", "value": str(value)}
    raise ValueError(dtype)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--schema", required=True)
    ap.add_argument("--artifact", required=True)
    ap.add_argument("--donor", required=True)
    ap.add_argument("--engine", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument(
        "--input-prefix",
        required=True,
        help="Absolute id prefix for input slots, e.g. "
        "'us-ny:policies/otda/snap/fy-2026-benefit-calculation#input.'",
    )
    ap.add_argument("--period-start", default="2026-01-01")
    ap.add_argument("--period-end", default="2026-01-31")
    ap.add_argument("--mode", default="fast", choices=["fast", "explain"])
    args = ap.parse_args()

    program = json.loads(Path(args.artifact).read_text())["program"]
    donor = json.loads(Path(args.donor).read_text())
    donor_slots = {
        e["name"]: (e["dtype"], e["default"])
        for e in donor["household_inputs"] + donor["person_inputs"]
    }

    # --- dtype ground truth from the artifact's expression trees --------
    # An input's dtype is pinned by how the compiled program uses it:
    # compared against a bool/integer/decimal literal (or a derived rule /
    # parameter of known dtype), fed into arithmetic, or used as a
    # boolean operand. This beats name heuristics.
    rule_dtypes = {d["name"]: d.get("dtype") for d in program["derived"]}
    param_dtypes: dict[str, str] = {}
    for p in program.get("parameters", []):
        versions = p.get("versions") or []
        vals = (versions[0].get("values") or {}) if versions else {}
        kinds = {v.get("kind") for v in vals.values() if isinstance(v, dict)}
        if kinds:
            param_dtypes[p["name"]] = (
                "decimal" if "decimal" in kinds else next(iter(kinds))
            )

    def node_dtype(node) -> str | None:
        if not isinstance(node, dict):
            return None
        k = node.get("kind")
        if k == "literal":
            v = node.get("value")
            return v.get("kind") if isinstance(v, dict) else None
        if k in ("integer", "decimal", "bool", "date"):
            return k
        if k == "derived":
            return rule_dtypes.get(node.get("name"))
        if k == "parameter_lookup":
            return param_dtypes.get(node.get("parameter") or node.get("name"))
        if k in ("add", "sub", "mul", "min", "max", "floor", "ceil"):
            return "decimal"
        if k in ("and", "or", "not", "comparison"):
            return "bool"
        return None

    artifact_dtypes: dict[str, str] = {}

    def note(name: str, dtype: str | None) -> None:
        if dtype in ("bool", "integer", "decimal", "date"):
            # numeric evidence wins over earlier bool evidence and vice
            # versa never downgrades: first concrete numeric sticks.
            prev = artifact_dtypes.get(name)
            if prev is None or (prev == "bool" and dtype != "bool"):
                artifact_dtypes[name] = dtype

    def classify(node, expected: str | None) -> None:
        if isinstance(node, list):
            for v in node:
                classify(v, expected)
            return
        if not isinstance(node, dict):
            return
        k = node.get("kind")
        if k == "input":
            note(node["name"], expected)
            return
        if k == "comparison":
            left, right = node.get("left"), node.get("right")
            classify(left, node_dtype(right))
            classify(right, node_dtype(left))
            return
        if k in ("and", "or", "not"):
            classify(node.get("items"), "bool")
            classify(node.get("item"), "bool")
            return
        if k == "if":
            classify(node.get("condition"), "bool")
            classify(node.get("then_expr"), expected)
            classify(node.get("else_expr"), expected)
            return
        if k in ("add", "sub", "mul", "min", "max", "floor", "ceil"):
            classify(node.get("items"), "decimal")
            classify(node.get("item"), "decimal")
            for key in ("left", "right"):
                if key in node:
                    classify(node[key], "decimal")
            return
        for v in node.values():
            classify(v, None)

    for dr in program["derived"]:
        classify(dr.get("expr"), dr.get("dtype"))

    outputs_by_name = {d["name"]: d["id"] for d in program["derived"]}
    relations = [r["name"] for r in program.get("relations", [])]
    # Query every derived output so the recovered input set covers any
    # surface the demo may request, not just the headline's dependencies.
    all_output_ids = sorted(outputs_by_name.values())

    interval = {"start": args.period_start, "end": args.period_end}
    period = {"period_kind": "month", **interval}

    known: dict[str, dict] = {}  # name -> {entity, dtype, default}

    def build_request() -> bytes:
        inputs = []
        for name, spec in known.items():
            for ent in spec["entities"]:
                eid = "h0" if ent == "household" else "p0"
                entity = "Household" if ent == "household" else "Person"
                inputs.append(
                    {
                        "name": args.input_prefix + name,
                        "entity": entity,
                        "entity_id": eid,
                        "interval": interval,
                        "value": scalar(spec["dtype"], spec["default"]),
                    }
                )
        rels = [
            {"name": r, "tuple": ["p0", "h0"], "interval": interval}
            for r in relations
        ]
        return json.dumps(
            {
                "mode": args.mode,
                "dataset": {"inputs": inputs, "relations": rels},
                "queries": [
                    {"entity_id": "h0", "period": period, "outputs": all_output_ids}
                ],
            }
        ).encode()

    FLIP = {"bool": "integer", "integer": "bool"}
    order: list[str] = []

    def run_engine() -> tuple[int, str]:
        proc = subprocess.run(
            [args.engine, "run-compiled", "--artifact", args.artifact],
            input=build_request(),
            capture_output=True,
        )
        return proc.returncode, proc.stderr.decode()

    def set_dtype(name: str, dtype: str) -> None:
        known[name]["dtype"] = dtype
        known[name]["default"] = (
            0 if dtype == "integer" else False if dtype == "bool" else known[name]["default"]
        )

    flip_counts: dict[str, int] = {}

    def flip_search(err: str) -> bool:
        """One heuristic slot has the wrong dtype: try flipping each
        (most recent first) until the engine's error changes. Real
        progress means the run succeeds or a NEW missing input appears —
        merely producing a different type error does not count, and a
        slot is never flipped more than twice."""
        candidates = [
            n for n in reversed(order)
            if n not in donor_slots
            and known[n]["dtype"] in FLIP
            and flip_counts.get(n, 0) < 2
        ]
        for cand in candidates:
            old = known[cand]["dtype"]
            set_dtype(cand, FLIP[old])
            rc, new_err = run_engine()
            if rc == 0 or MISSING_RE.search(new_err):
                flip_counts[cand] = flip_counts.get(cand, 0) + 1
                return True  # real progress — keep the flip
            set_dtype(cand, old)
        return False

    iteration = 0
    for iteration in range(700):
        rc, err = run_engine()
        if rc == 0:
            break
        m = MISSING_RE.search(err)
        if not m:
            # flip_search disabled: dtype truth comes from donor+artifact.
            guessed = [
                f"{n}:{s['dtype']}" for n, s in known.items() if n not in donor_slots
            ]
            sys.stderr.write(f"unrecoverable engine error:\n{err[:800]}\n")
            sys.stderr.write(f"heuristic-guessed slots so far: {guessed}\n")
            return 1
        name, ent = m.group(1), "person" if m.group(2) == "p" else "household"
        if name in known:
            # Same slot demanded on the other entity too — attach to both.
            known[name]["entities"].add(ent)
            continue
        if name in donor_slots:
            dtype, default = donor_slots[name]
        elif name in artifact_dtypes:
            dtype = artifact_dtypes[name]
            # decimal evidence usually means "numeric"; money slots stay
            # integer like the donor's convention unless truly fractional.
            if dtype == "decimal" and not any(h in name for h in DECIMAL_HINTS):
                dtype = "integer"
            default = {"bool": False, "integer": 0, "decimal": 1.0, "date": "2026-01-01"}[dtype]
        else:
            dtype, default = guess(name)
        known[name] = {"entities": {ent}, "dtype": dtype, "default": default}
        order.append(name)
    else:
        sys.stderr.write(
            f"did not converge after {iteration + 1} iterations; "
            f"{len(known)} slots known; last error:\n{err[:400]}\n"
        )
        return 1

    hh = [
        {"name": n, "dtype": s["dtype"], "default": s["default"]}
        for n, s in sorted(known.items())
        if "household" in s["entities"]
    ]
    pe = [
        {"name": n, "dtype": s["dtype"], "default": s["default"]}
        for n, s in sorted(known.items())
        if "person" in s["entities"]
    ]
    out = {
        "schema": args.schema,
        "input_prefix": args.input_prefix,
        "household_inputs": hh,
        "person_inputs": pe,
        "relations": relations,
        "outputs_by_name": outputs_by_name,
        "all_outputs": sorted(outputs_by_name.values()),
    }
    Path(args.out).write_text(json.dumps(out, indent=2) + "\n")
    print(
        f"{args.slug}: {len(hh)} household + {len(pe)} person inputs, "
        f"{len(outputs_by_name)} outputs, engine-verified in {iteration + 1} runs"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
