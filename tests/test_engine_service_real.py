"""Engine service tests against the real axiom-rules-engine and the pinned
rulespec trees.

Skipped unless CO_SNAP_SERVICE_FIXTURE points at a layout built by
scripts/setup-service-fixture.py; CI's engine-service-real job builds one.
The program bases come from engine/artifacts (bun run
scripts/dump-program-bases.ts).

Beyond the fake-engine suite:
  R1  In place with no overrides, each program compiles to its prebuilt
      artifact byte for byte — what prewarm checks in production.
  R2  Differential: for every lever in src/lib/parameters.ts at several
      multipliers, the in-place artifact is byte-identical to the one the
      pre-fix copy-based path compiles.
  R3  An identity reform (every lever at 1.0) sweeps exactly like the
      baseline.
  R4  Concurrent mixed requests across both programs return what the same
      requests return one at a time, and the trees end pristine.
  R5  Parity with production as observed on 2026-10-21 (NY and CO,
      1 person, $500 shelter): $298 at $0 earnings, $328 with the maximum
      allotment table ×1.1.
"""

from __future__ import annotations

import json
import os
import re
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

import engine_pins
from conftest import ROOT, reference_compile, tree_digest
from engine_service import EngineService, ServiceConfig

FIXTURE = os.environ.get("CO_SNAP_SERVICE_FIXTURE")
pytestmark = pytest.mark.skipif(
    not FIXTURE, reason="set CO_SNAP_SERVICE_FIXTURE (scripts/setup-service-fixture.py)"
)

BASES_DIR = ROOT / "engine" / "artifacts"

# Mirrors LEVERS in src/lib/parameters.ts (test_levers_mirror_parameters_ts
# keeps the two in step).
US_DEDUCTIONS = "policies/usda/snap/fy-2026-cola/deductions.yaml"
US_INCOME = "policies/usda/snap/fy-2026-cola/income-eligibility-standards.yaml"
US_MAX_ALLOTMENT = "policies/usda/snap/fy-2026-cola/maximum-allotments.yaml"
US_EARNED_DEDUCTION = "statutes/7/2014/e/2.yaml"
CO_BBCE = "regulations/10-ccr-2506-1/4.401.1.yaml"
NY_BBCE = "regulations/18-nycrr/387/14/a/5.yaml"


def _ov(repo, file_relative, parameter, kind, m):
    return {
        "repo": repo,
        "file_relative": file_relative,
        "parameter": parameter,
        "patch": {"kind": kind, "multiplier": m},
    }


LEVERS = {
    "max_allotment_scale": (
        ("co-snap", "ny-snap"),
        lambda m: [
            _ov("rules-us", US_MAX_ALLOTMENT, "snap_maximum_allotment_table", "scale_values", m),
            _ov(
                "rules-us",
                US_MAX_ALLOTMENT,
                "snap_maximum_allotment_additional_member",
                "scale_formula",
                m,
            ),
        ],
    ),
    "standard_deduction_scale": (
        ("co-snap", "ny-snap"),
        lambda m: [
            _ov(
                "rules-us",
                US_DEDUCTIONS,
                "snap_standard_deduction_48_states_dc_table",
                "scale_values",
                m,
            )
        ],
    ),
    "earned_income_deduction_scale": (
        ("co-snap", "ny-snap"),
        lambda m: [
            _ov(
                "rules-us",
                US_EARNED_DEDUCTION,
                "snap_earned_income_deduction_rate",
                "scale_formula",
                m,
            )
        ],
    ),
    "gross_income_limit_scale": (
        ("co-snap", "ny-snap"),
        lambda m: [
            _ov(
                "rules-us",
                US_INCOME,
                "snap_gross_income_limit_130_percent_fpl_48_states_dc_table",
                "scale_values",
                m,
            )
        ],
    ),
    "net_income_limit_scale": (
        ("co-snap", "ny-snap"),
        lambda m: [
            _ov(
                "rules-us",
                US_INCOME,
                "snap_net_income_limit_100_percent_fpl_48_states_dc_table",
                "scale_values",
                m,
            )
        ],
    ),
    "co_bbce_limit_scale": (
        ("co-snap",),
        lambda m: [
            _ov(
                "rules-us-co",
                CO_BBCE,
                "co_snap_expanded_categorical_income_fpl_ratio",
                "scale_formula",
                m,
            )
        ],
    ),
    "ny_bbce_150_limit_scale": (
        ("ny-snap",),
        lambda m: [
            _ov(
                "rules-us-ny",
                NY_BBCE,
                "ny_snap_categorical_eligibility_150_percent_fpl_ratio",
                "scale_formula",
                m,
            )
        ],
    ),
}

HOUSEHOLD = {
    "household_size": 1,
    "monthly_shelter_costs": 500,
    "pays_separate_heating_or_cooling": True,
    "oldest_member_age": 30,
    "any_member_elderly_or_disabled": False,
    "primary_member_is_us_citizen": True,
    "liquid_resources": 0,
    "region": "nyc",
}


def levers_for(program: str) -> list[str]:
    return [lid for lid, (programs, _) in LEVERS.items() if program in programs]


def reform(program: str, multipliers: dict[str, float]) -> list[dict]:
    return [ov for lid, m in multipliers.items() for ov in LEVERS[lid][1](m)]


def sweep_body(program: str, overrides: list[dict], **household) -> dict:
    return {
        "program": program,
        "household": {**HOUSEHOLD, **household},
        "earnings_min": 0,
        "earnings_max": 4000,
        "earnings_step": 100,
        "overrides": overrides,
    }


@pytest.fixture(scope="module")
def layout(tmp_path_factory):
    fixture = Path(FIXTURE)
    if not all((BASES_DIR / f"{slug}-base.json").exists() for slug in engine_pins.PROGRAMS):
        pytest.fail(f"missing program bases in {BASES_DIR}: bun run scripts/dump-program-bases.ts")
    # Serve from a copy: the tests patch trees in place.
    root = tmp_path_factory.mktemp("real")
    shutil.copytree(fixture / "programs", root / "programs")
    return {
        "root": root,
        "config": ServiceConfig(
            bin_path=str(fixture / "bin" / "axiom-rules-engine"),
            programs=engine_pins.PROGRAMS,
            programs_root=root / "programs",
            artifacts_dir=fixture / "artifacts",
            bases_dir=BASES_DIR,
            default_program=engine_pins.DEFAULT_PROGRAM,
            scratch_dir=root / "scratch",
            prewarm=False,
        ),
    }


@pytest.fixture
def service(layout):
    return EngineService(layout["config"])


def test_levers_mirror_parameters_ts():
    source = (ROOT / "src/lib/parameters.ts").read_text()
    ts_ids = re.findall(r'^\s+id: "(\w+)"', source, re.M)
    ts_params = set(re.findall(r'parameter: "(\w+)"', source))
    py_params = {ov["parameter"] for _, build in LEVERS.values() for ov in build(1.5)}
    assert ts_ids == list(LEVERS)
    assert ts_params == py_params


def test_in_place_baseline_compile_matches_prebuilt(service, layout):  # R1
    service.prewarm()
    assert {s: p["prewarm"]["state"] for s, p in service.health()["programs"].items()} == {
        "co-snap": "ok",
        "ny-snap": "ok",
    }


@pytest.mark.parametrize("program", sorted(engine_pins.PROGRAMS))
@pytest.mark.parametrize("multiplier", [0, 0.5, 1.15, 2])
def test_in_place_artifacts_match_copy_based_reference(service, layout, tmp_path, program, multiplier):  # R2
    before = tree_digest(layout["root"] / "programs")
    for lever in levers_for(program):
        overrides = reform(program, {lever: multiplier})
        actual = service.compiled_artifact(program, overrides)[0].read_bytes()
        expected = reference_compile(
            layout["config"].bin_path,
            layout["root"] / "programs" / program,
            engine_pins.PROGRAMS[program],
            overrides,
            tmp_path / f"{lever}.json",
        )
        assert actual == expected, f"{program} {lever} ×{multiplier}"
    assert tree_digest(layout["root"] / "programs") == before


@pytest.mark.parametrize("program", sorted(engine_pins.PROGRAMS))
def test_identity_reform_sweeps_like_baseline(service, program):  # R3
    identity = reform(program, {lever: 1 for lever in levers_for(program)})
    baseline = service.cliff_sweep(sweep_body(program, []))
    reformed = service.cliff_sweep(sweep_body(program, identity))
    assert reformed["points"] == baseline["points"]
    assert reformed["summary"] == baseline["summary"]


def test_concurrent_mixed_requests_equal_sequential(layout):  # R4
    bodies = [
        sweep_body(program, reform(program, {lever: m}), monthly_shelter_costs=shelter)
        for program in sorted(engine_pins.PROGRAMS)
        for lever, m in (("max_allotment_scale", 1.25), ("earned_income_deduction_scale", 0.5))
        for shelter in (300, 900)
    ] + [sweep_body(p, []) for p in sorted(engine_pins.PROGRAMS)]
    before = tree_digest(layout["root"] / "programs")
    sequential = [EngineService(layout["config"]).cliff_sweep(b)["points"] for b in bodies]
    concurrent_service = EngineService(layout["config"])
    with ThreadPoolExecutor(max_workers=len(bodies)) as pool:
        concurrent = list(pool.map(lambda b: concurrent_service.cliff_sweep(b)["points"], bodies))
    assert concurrent == sequential
    assert tree_digest(layout["root"] / "programs") == before


@pytest.mark.parametrize("program", sorted(engine_pins.PROGRAMS))
def test_parity_with_production(service, program):  # R5
    baseline = service.cliff_sweep(sweep_body(program, []))
    table_only = [
        _ov("rules-us", US_MAX_ALLOTMENT, "snap_maximum_allotment_table", "scale_values", 1.1)
    ]
    reformed = service.cliff_sweep(sweep_body(program, table_only))
    assert baseline["points"][0]["snap"] == 298
    assert reformed["points"][0]["snap"] == 328
    json.dumps(reformed)  # the response stays JSON-serializable
