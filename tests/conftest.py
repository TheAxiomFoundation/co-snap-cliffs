"""Shared fixtures: a fake-engine service layout built fresh per test."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine_service import ServiceConfig  # noqa: E402

FAKE_ENGINE = Path(__file__).resolve().parent / "fake_engine.py"

# File paths and parameter names mirror src/lib/parameters.ts.
US_MAX_ALLOTMENT = "policies/usda/snap/fy-2026-cola/maximum-allotments.yaml"
US_DEDUCTIONS = "policies/usda/snap/fy-2026-cola/deductions.yaml"
US_EARNED_DEDUCTION = "statutes/7/2014/e/2.yaml"
CO_BBCE = "regulations/10-ccr-2506-1/4.401.1.yaml"
NY_BBCE = "regulations/18-nycrr/387/14/a/5.yaml"

FAKE_PROGRAMS = {
    "co-snap": {
        "state_repo": "rulespec-us-co",
        "program_rel": "policies/cdhs/snap/fy-2026-benefit-calculation.yaml",
    },
    "ny-snap": {
        "state_repo": "rulespec-us-ny",
        "program_rel": "policies/otda/snap/fy-2026-benefit-calculation.yaml",
    },
}

FEDERAL_FILES = {
    US_MAX_ALLOTMENT: """\
# Fake fixture. Comments and quoting survive the round trip.
rules:
  - name: snap_maximum_allotment_table
    kind: parameter
    versions:
      - effective_from: '2025-10-01'
        values:
          1: 298
          2: 546
          3: 785
  - name: snap_maximum_allotment_additional_member
    kind: parameter
    versions:
      - effective_from: '2025-10-01'
        formula: '218'
  - name: snap_maximum_allotment
    kind: derived
    versions:
      - formula: snap_maximum_allotment_table
""",
    US_DEDUCTIONS: """\
rules:
  - name: snap_standard_deduction_48_states_dc_table
    kind: parameter
    versions:
      - effective_from: '2025-10-01'
        values:
          1: 209
          4: 223
""",
    US_EARNED_DEDUCTION: """\
rules:
  - name: snap_earned_income_deduction_rate
    kind: parameter
    versions:
      - effective_from: '1977-09-29'
        formula: '0.2'
""",
}

STATE_FILES = {
    "co-snap": {
        "policies/cdhs/snap/fy-2026-benefit-calculation.yaml": "program: co-snap\n",
        CO_BBCE: """\
rules:
  - name: co_snap_expanded_categorical_income_fpl_ratio
    kind: parameter
    versions:
      - effective_from: '2025-10-01'
        formula: '2.0'
""",
    },
    "ny-snap": {
        "policies/otda/snap/fy-2026-benefit-calculation.yaml": "program: ny-snap\n",
        NY_BBCE: """\
rules:
  - name: ny_snap_categorical_eligibility_150_percent_fpl_ratio
    kind: parameter
    versions:
      - effective_from: '2025-10-01'
        formula: '1.5'
""",
    },
}

BASES = {
    "co-snap": {
        "schema": "fake",
        "household_inputs": [
            {"name": "household_size", "dtype": "integer", "default": 1},
            {"name": "employee_wages_received", "dtype": "decimal", "default": 0},
            {"name": "household_shelter_costs_incurred", "dtype": "decimal", "default": 0},
        ],
        "person_inputs": [{"name": "member_age", "dtype": "integer", "default": 30}],
        "relations": ["fake:relation.member_of_household"],
        "outputs_by_name": {
            "snap_regular_month_allotment": "fake:co#snap_regular_month_allotment",
            "snap_eligible": "fake:co#snap_eligible",
        },
    },
    "ny-snap": {
        "schema": "fake",
        "input_prefix": "fake:ny#input.",
        "household_inputs": [
            {"name": "household_size", "dtype": "integer", "default": 1},
            {"name": "snap_gross_monthly_earned_income", "dtype": "decimal", "default": 0},
            {"name": "snap_countable_earned_income", "dtype": "decimal", "default": 0},
            {"name": "household_shelter_costs_incurred", "dtype": "decimal", "default": 0},
            {"name": "household_resides_in_new_york_city", "dtype": "bool", "default": False},
        ],
        "person_inputs": [{"name": "member_age", "dtype": "integer", "default": 30}],
        "relations": ["fake:relation.member_of_household"],
        "outputs_by_name": {
            "snap_regular_month_allotment": "fake:ny#snap_regular_month_allotment",
            "snap_eligible": "fake:ny#snap_eligible",
        },
    },
}


def tree_digest(root: Path) -> dict[str, str]:
    """sha256 of every file under ``root``, keyed by relative path."""
    return {
        str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(root.rglob("*"))
        if p.is_file()
    }


# --- The pre-fix override path, verbatim from origin/main's modal_app.py ---
# (14bbf6c), kept independent of engine_service so differential tests compare
# the new service against the old code, not against itself.

REFERENCE_REPO_CANONICAL = {
    "rules-us": "rulespec-us",
    "rules-us-co": "rulespec-us-co",
    "rules-us-ny": "rulespec-us-ny",
    "rulespec-us": "rulespec-us",
    "rulespec-us-co": "rulespec-us-co",
    "rulespec-us-ny": "rulespec-us-ny",
}


def reference_yaml():
    from ruamel.yaml import YAML

    yaml_io = YAML()
    yaml_io.preserve_quotes = True
    yaml_io.indent(mapping=2, sequence=4, offset=2)
    yaml_io.width = 4096
    return yaml_io


def reference_apply_patch(rule, patch) -> None:
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


def reference_compile(
    bin_path: str, program_dir: Path, cfg: dict, overrides: list[dict], out: Path
) -> bytes:
    """The pre-fix override path: copy the program's trees to a scratch dir,
    patch the copies, compile."""
    import tempfile

    yaml_io = reference_yaml()
    scratch = Path(tempfile.mkdtemp(prefix="reference-"))
    try:
        for name in ("rulespec-us", cfg["state_repo"]):
            shutil.copytree(program_dir / name, scratch / name)
        by_file: dict[Path, list[dict]] = {}
        for ov in overrides:
            by_file.setdefault(
                scratch / REFERENCE_REPO_CANONICAL[ov["repo"]] / ov["file_relative"], []
            ).append(ov)
        for file, file_overrides in by_file.items():
            doc = yaml_io.load(file.read_text())
            for ov in file_overrides:
                rule = next(r for r in doc["rules"] if r.get("name") == ov["parameter"])
                reference_apply_patch(rule, ov["patch"])
            with file.open("w") as f:
                yaml_io.dump(doc, f)
        subprocess.run(
            [
                bin_path,
                "compile",
                "--program",
                str(scratch / cfg["state_repo"] / cfg["program_rel"]),
                "--output",
                str(out),
            ],
            check=True,
            capture_output=True,
        )
        return out.read_bytes()
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


@dataclass
class Layout:
    root: Path
    bin_path: str
    programs: dict[str, dict[str, str]]

    @property
    def programs_root(self) -> Path:
        return self.root / "programs"

    def config(self, **overrides) -> ServiceConfig:
        values = dict(
            bin_path=self.bin_path,
            programs=self.programs,
            programs_root=self.programs_root,
            artifacts_dir=self.root / "artifacts",
            bases_dir=self.root / "bases",
            default_program="ny-snap",
            scratch_dir=self.root / "scratch",
            prewarm=False,
        )
        values.update(overrides)
        return ServiceConfig(**values)

    def digest(self) -> dict[str, str]:
        return tree_digest(self.programs_root)


def padding_rule(rows: int) -> str:
    """A large parameter table, so YAML parses take long enough for threads
    to interleave mid-parse (the GIL switches every 5 ms)."""
    values = "".join(f"          {i}: {i * 7}\n" for i in range(1, rows + 1))
    return f"""\
  - name: snap_fake_padding_table
    kind: parameter
    versions:
      - effective_from: '2025-10-01'
        values:
{values}"""


def build_fake_layout(root: Path, padding_rows: int = 0) -> Layout:
    wrapper = root / "fake-engine"
    wrapper.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{FAKE_ENGINE}" "$@"\n')
    wrapper.chmod(0o755)
    (root / "artifacts").mkdir()
    (root / "bases").mkdir()
    for slug, cfg in FAKE_PROGRAMS.items():
        program_dir = root / "programs" / slug
        for rel, text in FEDERAL_FILES.items():
            if rel == US_MAX_ALLOTMENT and padding_rows:
                text += padding_rule(padding_rows)
            path = program_dir / "rulespec-us" / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        for rel, text in STATE_FILES[slug].items():
            path = program_dir / cfg["state_repo"] / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        (root / "bases" / f"{slug}-base.json").write_text(json.dumps(BASES[slug]))
        subprocess.run(
            [
                str(wrapper),
                "compile",
                "--program",
                str(program_dir / cfg["state_repo"] / cfg["program_rel"]),
                "--output",
                str(root / "artifacts" / f"{slug}.compiled.json"),
            ],
            check=True,
        )
    return Layout(root=root, bin_path=str(wrapper), programs=FAKE_PROGRAMS)


@pytest.fixture
def fake_layout(tmp_path: Path) -> Layout:
    return build_fake_layout(tmp_path)


@pytest.fixture
def engine_log(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Path the fake engine appends one line per invocation to."""
    log = tmp_path / "engine.log"
    log.write_text("")
    monkeypatch.setenv("FAKE_ENGINE_LOG", str(log))
    return log
