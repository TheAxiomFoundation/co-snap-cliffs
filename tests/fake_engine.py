"""Stand-in for the axiom-rules-engine binary in the service tests.

    compile --program P --output O
        Reads every *.yaml under the program root (the directory holding
        rulespec-us), and writes an "artifact" recording each parameter rule's
        version-0 values or formula plus a digest of every file. A parameter
        formula of "fail" makes the compile exit 1.
    run-compiled --artifact A   (request JSON on stdin)
        Evaluates a toy allotment per queried household,
        max(0, round(max_allotment[size] - 0.3 * earnings * (1 - rate))),
        and echoes the artifact under "fake" so tests can see exactly what
        the compile read.

FAKE_ENGINE_COMPILE_DELAY (seconds) holds the compile open after reading the
tree, widening race windows. Every invocation appends a line to
$FAKE_ENGINE_LOG when set.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path

from ruamel.yaml import YAML


def program_root(program: Path) -> Path:
    for parent in program.parents:
        if (parent / "rulespec-us").is_dir():
            return parent
    sys.exit(f"no rulespec-us above {program}")


def compile_(program: Path, output: Path) -> int:
    root = program_root(program)
    loader = YAML(typ="safe")
    files: dict[str, str] = {}
    parameters: dict[str, dict] = {}
    for path in sorted(root.rglob("*.yaml")):
        data = path.read_bytes()
        files[str(path.relative_to(root))] = hashlib.sha256(data).hexdigest()
        doc = loader.load(data.decode("utf-8")) or {}
        for rule in doc.get("rules") or []:
            if rule.get("kind") != "parameter":
                continue
            version = (rule.get("versions") or [{}])[0]
            if version.get("formula") == "fail":
                print(f"error: {rule['name']} has a failing formula", file=sys.stderr)
                return 1
            entry = {}
            if "values" in version:
                entry["values"] = {str(k): v for k, v in version["values"].items()}
            if "formula" in version:
                entry["formula"] = str(version["formula"])
            parameters[rule["name"]] = entry
    time.sleep(float(os.environ.get("FAKE_ENGINE_COMPILE_DELAY") or 0))
    output.write_text(json.dumps({"parameters": parameters, "files": files}, sort_keys=True))
    return 0


def run_compiled(artifact: Path) -> int:
    compiled = json.loads(artifact.read_text())
    request = json.loads(sys.stdin.read())
    params = compiled["parameters"]
    table = {int(k): float(v) for k, v in params["snap_maximum_allotment_table"]["values"].items()}
    rate = float(params["snap_earned_income_deduction_rate"]["formula"])
    facts: dict[str, dict[str, float]] = {}
    for record in request["dataset"]["inputs"]:
        slot = record["name"].rsplit("#input.", 1)[-1]
        facts.setdefault(record["entity_id"], {})[slot] = record["value"]["value"]
    results = []
    for query in request["queries"]:
        hh = facts.get(query["entity_id"], {})
        size = int(hh.get("household_size", 1))
        earnings = float(
            hh.get("snap_gross_monthly_earned_income", hh.get("employee_wages_received", 0))
        )
        snap = max(0, round(table[min(size, max(table))] - 0.3 * earnings * (1 - rate)))
        outputs = {}
        for output_id in query["outputs"]:
            if output_id.endswith("snap_regular_month_allotment"):
                outputs[output_id] = {
                    "kind": "scalar",
                    "value": {"kind": "decimal", "value": str(snap)},
                }
            elif output_id.endswith("snap_eligible"):
                outputs[output_id] = {
                    "kind": "judgment",
                    "outcome": "holds" if snap > 0 else "not_holds",
                }
        results.append({"entity_id": query["entity_id"], "outputs": outputs})
    json.dump({"results": results, "fake": compiled}, sys.stdout)
    return 0


def main() -> int:
    args = sys.argv[1:]
    log = os.environ.get("FAKE_ENGINE_LOG")
    if log:
        with open(log, "a") as f:
            f.write(" ".join(args[:1]) + "\n")
    opts = dict(zip(args[1::2], args[2::2]))
    if args[:1] == ["compile"]:
        return compile_(Path(opts["--program"]), Path(opts["--output"]))
    if args[:1] == ["run-compiled"]:
        return run_compiled(Path(opts["--artifact"]))
    print(f"unknown command: {args}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
