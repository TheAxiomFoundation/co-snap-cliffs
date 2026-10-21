"""Engine service tests against the fake engine (tests/fake_engine.py).

Invariants under test, for every input:
  I1  Isolation: an override compile sees exactly its own overrides, even
      with other compiles in flight — the artifact equals the one the
      pre-fix copy-based path (conftest.reference_compile) produces.
  I2  Restoration: once requests finish, every program tree holds its
      original bytes, including after rejected and failed compiles.
  I3  Rejection leaves no trace: an invalid override never touches disk.
  I4  Reuse: a reform compiles once per container; household edits under
      it run the cached artifact.
  I5  Liveness: a slow compile blocks neither /health nor baseline sweeps.
"""

from __future__ import annotations

import json
import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from conftest import (
    CO_BBCE,
    FAKE_PROGRAMS,
    NY_BBCE,
    US_DEDUCTIONS,
    US_EARNED_DEDUCTION,
    US_MAX_ALLOTMENT,
    build_fake_layout,
    reference_compile,
)
from engine_service import (
    EngineService,
    OverrideError,
    TreeUnavailable,
    apply_patch,
    create_app,
)

HOUSEHOLD = {"household_size": 1, "monthly_shelter_costs": 500}


def max_allotment(multiplier: float, repo: str = "rules-us") -> list[dict]:
    return [
        {
            "repo": repo,
            "file_relative": US_MAX_ALLOTMENT,
            "parameter": "snap_maximum_allotment_table",
            "patch": {"kind": "scale_values", "multiplier": multiplier},
        },
        {
            "repo": repo,
            "file_relative": US_MAX_ALLOTMENT,
            "parameter": "snap_maximum_allotment_additional_member",
            "patch": {"kind": "scale_formula", "multiplier": multiplier},
        },
    ]


def earned_deduction(multiplier: float) -> list[dict]:
    return [
        {
            "repo": "rules-us",
            "file_relative": US_EARNED_DEDUCTION,
            "parameter": "snap_earned_income_deduction_rate",
            "patch": {"kind": "scale_formula", "multiplier": multiplier},
        }
    ]


def sweep(service: EngineService, overrides: list[dict], program="ny-snap", **household):
    return service.cliff_sweep(
        {
            "program": program,
            "household": {**HOUSEHOLD, **household},
            "earnings_min": 0,
            "earnings_max": 1000,
            "earnings_step": 100,
            "overrides": overrides,
        }
    )


EMPTY_REQUEST = {"mode": "explain", "dataset": {"inputs": [], "relations": []}, "queries": []}


def raw_run(service: EngineService, overrides: list[dict], program="ny-snap") -> dict:
    """POST /run with an empty request; returns the fake engine's echo of
    what the compile read."""
    return service.run({"program": program, "request": EMPTY_REQUEST, "overrides": overrides})[
        "fake"
    ]


# -- arithmetic + wiring -----------------------------------------------------


def test_baseline_runs_the_prebuilt_artifact(fake_layout, engine_log):
    service = EngineService(fake_layout.config())
    result = sweep(service, [])
    assert result["points"][0]["snap"] == 298
    # 298 - 0.3 * 100 * 0.8 = 274
    assert result["points"][1]["snap"] == 274
    assert engine_log.read_text().split() == ["run-compiled"]


def test_override_changes_the_result_and_restores_the_tree(fake_layout):
    before = fake_layout.digest()
    service = EngineService(fake_layout.config())
    result = sweep(service, max_allotment(1.5))
    # round(298 * 1.5) = 447
    assert result["points"][0]["snap"] == 447
    echo = raw_run(service, max_allotment(1.5) + earned_deduction(0.5))
    assert echo["parameters"]["snap_maximum_allotment_table"]["values"] == {
        "1": 447,
        "2": 819,
        "3": 1178,
    }
    assert echo["parameters"]["snap_maximum_allotment_additional_member"]["formula"] == "327.0"
    assert echo["parameters"]["snap_earned_income_deduction_rate"]["formula"] == "0.1"
    assert fake_layout.digest() == before


def test_override_compiles_once_and_household_edits_reuse_it(fake_layout, engine_log):
    service = EngineService(fake_layout.config())
    for shelter in (500, 600, 700):
        sweep(service, max_allotment(1.2), monthly_shelter_costs=shelter)
    sweep(service, max_allotment(1.2), monthly_shelter_costs=500)  # result-cache hit
    assert engine_log.read_text().split() == ["compile"] + ["run-compiled"] * 3


def test_programs_patch_their_own_trees(fake_layout):
    service = EngineService(fake_layout.config())
    co = raw_run(service, max_allotment(2.0), program="co-snap")
    ny = raw_run(service, [], program="ny-snap")
    assert co["parameters"]["snap_maximum_allotment_table"]["values"]["1"] == 596
    assert ny["parameters"]["snap_maximum_allotment_table"]["values"]["1"] == 298


# -- I3: rejected overrides --------------------------------------------------


@pytest.mark.parametrize(
    "override, message",
    [
        ({"repo": "rules-us-xx", "file_relative": US_DEDUCTIONS}, "unknown override repo"),
        ({"repo": "rules-us-co", "file_relative": CO_BBCE}, "not valid for program"),
        ({"repo": "rules-us", "file_relative": "../rulespec-us-ny/" + NY_BBCE}, "escapes"),
        ({"repo": "rules-us", "file_relative": "../../co-snap/rulespec-us/" + US_DEDUCTIONS}, "escapes"),
        ({"repo": "rules-us", "file_relative": "/etc/hosts.yaml"}, "escapes"),
        ({"repo": "rules-us", "file_relative": "policies/missing.yaml"}, "not found"),
        ({"repo": "rules-us", "file_relative": "README.md"}, ".yaml path"),
        (
            {"repo": "rules-us", "file_relative": US_DEDUCTIONS, "parameter": "nope"},
            "not found in",
        ),
        (
            {
                "repo": "rules-us",
                "file_relative": US_MAX_ALLOTMENT,
                "parameter": "snap_maximum_allotment",
            },
            "kind=derived",
        ),
        (
            {
                "repo": "rules-us",
                "file_relative": US_DEDUCTIONS,
                "patch": {"kind": "scale_values", "multiplier": "2"},
            },
            "finite number",
        ),
        (
            {
                "repo": "rules-us",
                "file_relative": US_DEDUCTIONS,
                "patch": {"kind": "explode"},
            },
            "unknown patch kind",
        ),
    ],
)
def test_invalid_override_is_rejected_without_touching_disk(fake_layout, engine_log, override, message):
    before = fake_layout.digest()
    service = EngineService(fake_layout.config())
    full = {
        "parameter": "snap_standard_deduction_48_states_dc_table",
        "patch": {"kind": "scale_values", "multiplier": 2},
        **override,
    }
    # A valid override in the same request must not be written either.
    with pytest.raises(OverrideError, match=message):
        sweep(service, max_allotment(1.5) + [full])
    assert fake_layout.digest() == before
    assert "compile" not in engine_log.read_text().split()


def test_sweep_bounds_are_enforced(fake_layout):
    service = EngineService(fake_layout.config())
    with pytest.raises(OverrideError, match="points"):
        service.cliff_sweep({"earnings_max": 10**9, "earnings_step": 1})
    with pytest.raises(OverrideError, match="household_size"):
        service.cliff_sweep({"household": {"household_size": 500}})
    with pytest.raises(OverrideError, match="unknown program"):
        service.cliff_sweep({"program": "tx-snap"})


# -- I2: failed compiles -----------------------------------------------------


def test_failed_compile_restores_the_tree(fake_layout):
    before = fake_layout.digest()
    service = EngineService(fake_layout.config())
    failing = [
        {
            "repo": "rules-us",
            "file_relative": US_EARNED_DEDUCTION,
            "parameter": "snap_earned_income_deduction_rate",
            "patch": {"kind": "set_formula", "formula": "fail"},
        }
    ]
    from engine_service import EngineError

    with pytest.raises(EngineError, match="compile failed"):
        sweep(service, max_allotment(1.5) + failing)
    assert fake_layout.digest() == before
    # The failure is not cached, and the next reform compiles cleanly.
    assert sweep(service, max_allotment(1.5))["points"][0]["snap"] == 447


def test_unrestorable_tree_refuses_further_compiles(fake_layout, monkeypatch):
    service = EngineService(fake_layout.config())
    tree = service.trees["ny-snap"]
    real_write = Path.write_bytes

    def flaky_write(self, data):
        real_write(self, data + b"# corrupted\n")

    monkeypatch.setattr(Path, "write_bytes", flaky_write)
    sweep(service, max_allotment(1.5))
    monkeypatch.setattr(Path, "write_bytes", real_write)
    assert tree.unavailable
    assert service.health()["ok"] is False
    with pytest.raises(TreeUnavailable):
        sweep(service, max_allotment(1.6))
    # Baselines still serve from the prebuilt artifact.
    assert sweep(service, [])["points"][0]["snap"] == 298


def test_artifact_evicted_before_spawn_is_recompiled(fake_layout, engine_log):
    service = EngineService(fake_layout.config())
    overrides = max_allotment(1.5)
    stale, fresh = service.compiled_artifact("ny-snap", overrides)
    assert fresh
    # Evict it — entry and file both go, as when newer reforms land between
    # a request's cache lookup and its engine spawn — but hand the stale path
    # to the next lookup.
    service.compiled._entries.clear()
    stale.unlink()
    lookups = iter([stale])
    real_get = service.compiled.get
    service.compiled.get = lambda key: next(lookups, None) or real_get(key)
    result = service.execute("ny-snap", overrides, EMPTY_REQUEST)
    assert result["fake"]["parameters"]["snap_maximum_allotment_table"]["values"]["1"] == 447
    assert engine_log.read_text().split() == ["compile", "run-compiled", "compile", "run-compiled"]


def test_compiled_cache_is_bounded(fake_layout):
    service = EngineService(fake_layout.config(compiled_cache_max=2))
    paths = [service.compiled_artifact("ny-snap", max_allotment(m))[0] for m in (1.1, 1.2, 1.3)]
    assert [p.exists() for p in paths] == [False, True, True]


# -- prewarm -----------------------------------------------------------------


def prewarm_states(service: EngineService) -> dict[str, str]:
    return {slug: p["prewarm"]["state"] for slug, p in service.health()["programs"].items()}


def test_prewarm_reports_ok_and_detects_drift(fake_layout):
    before = fake_layout.digest()
    service = EngineService(fake_layout.config(prewarm=True))
    assert prewarm_states(service) == {"co-snap": "pending", "ny-snap": "pending"}
    service.prewarm()
    assert prewarm_states(service) == {"co-snap": "ok", "ny-snap": "ok"}
    (fake_layout.root / "artifacts" / "co-snap.compiled.json").write_text("{}")
    service = EngineService(fake_layout.config(prewarm=True))
    service.prewarm()
    assert prewarm_states(service) == {"co-snap": "mismatch", "ny-snap": "ok"}
    assert fake_layout.digest() == before


# -- patch arithmetic --------------------------------------------------------


@given(
    values=st.dictionaries(st.integers(1, 12), st.integers(0, 5000), min_size=1, max_size=8),
    multiplier=st.floats(0, 4, allow_nan=False),
)
def test_scale_values_rounds_each_value(values, multiplier):
    rule = {"name": "t", "versions": [{"values": dict(values)}]}
    apply_patch(rule, {"kind": "scale_values", "multiplier": multiplier})
    assert rule["versions"][0]["values"] == {k: round(v * multiplier) for k, v in values.items()}


@given(values=st.dictionaries(st.integers(1, 12), st.integers(0, 5000), min_size=1, max_size=8))
def test_scale_by_one_is_identity_on_integer_tables(values):
    rule = {"name": "t", "versions": [{"values": dict(values)}]}
    apply_patch(rule, {"kind": "scale_values", "multiplier": 1})
    assert rule["versions"][0]["values"] == values


@pytest.mark.parametrize("bad", [math.inf, -math.inf, math.nan, True, None, "1.5"])
def test_non_finite_multipliers_are_rejected(bad):
    rule = {"name": "t", "versions": [{"values": {1: 100}, "formula": "0.2"}]}
    for kind in ("scale_values", "scale_formula"):
        with pytest.raises(OverrideError):
            apply_patch(rule, {"kind": kind, "multiplier": bad})


# -- I1 + I2 under concurrency -----------------------------------------------

LEVERS = {
    "ny-snap": [
        lambda m: max_allotment(m),
        lambda m: max_allotment(m, repo="rulespec-us"),
        lambda m: earned_deduction(m),
        lambda m: [
            {
                "repo": "rules-us",
                "file_relative": US_DEDUCTIONS,
                "parameter": "snap_standard_deduction_48_states_dc_table",
                "patch": {"kind": "scale_values", "multiplier": m},
            }
        ],
        lambda m: [
            {
                "repo": "rules-us-ny",
                "file_relative": NY_BBCE,
                "parameter": "ny_snap_categorical_eligibility_150_percent_fpl_ratio",
                "patch": {"kind": "scale_formula", "multiplier": m},
            }
        ],
    ],
    "co-snap": [
        lambda m: max_allotment(m),
        lambda m: earned_deduction(m),
        lambda m: [
            {
                "repo": "rules-us-co",
                "file_relative": CO_BBCE,
                "parameter": "co_snap_expanded_categorical_income_fpl_ratio",
                "patch": {"kind": "scale_formula", "multiplier": m},
            }
        ],
    ],
}

multipliers = st.sampled_from([0, 0.5, 0.75, 1, 1.05, 1.5, 2])


@st.composite
def reform(draw):
    program = draw(st.sampled_from(sorted(LEVERS)))
    picks = draw(
        st.lists(st.tuples(st.integers(0, len(LEVERS[program]) - 1), multipliers), max_size=4)
    )
    overrides = [ov for i, m in picks for ov in LEVERS[program][i](m)]
    return program, overrides


@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow],
)
@given(reforms=st.lists(reform(), min_size=2, max_size=6))
def test_concurrent_compiles_match_the_copy_based_reference(tmp_path_factory, monkeypatch, reforms):
    monkeypatch.setenv("FAKE_ENGINE_COMPILE_DELAY", "0.01")
    layout = build_fake_layout(tmp_path_factory.mktemp("layout"))
    pristine = layout.digest()
    service = EngineService(layout.config())

    def artifact_bytes(program_overrides):
        program, overrides = program_overrides
        artifact, _ = service.compiled_artifact(program, overrides)
        return artifact.read_bytes()

    with ThreadPoolExecutor(max_workers=len(reforms)) as pool:
        got = list(pool.map(artifact_bytes, reforms))

    assert layout.digest() == pristine  # I2
    for (program, overrides), actual in zip(reforms, got):  # I1
        expected = reference_compile(
            layout.bin_path,
            layout.programs_root / program,
            FAKE_PROGRAMS[program],
            overrides,
            tmp_path_factory.mktemp("ref") / "out.json",
        )
        assert json.loads(actual) == json.loads(expected)


def test_each_tree_owns_its_yaml_parser(fake_layout):
    service = EngineService(fake_layout.config())
    parsers = [tree.yaml_io for tree in service.trees.values()]
    assert len({id(p) for p in parsers}) == len(parsers)


def test_cross_program_compiles_with_large_files_stay_isolated(tmp_path):
    """Stress version of I1: both programs compile at once while each parse
    is long enough for the threads to interleave."""
    layout = build_fake_layout(tmp_path, padding_rows=4000)
    pristine = layout.digest()
    service = EngineService(layout.config())
    reforms = [
        (program, max_allotment(m))
        for m in (0.5, 0.75, 1.05, 1.25, 1.5, 2)
        for program in ("co-snap", "ny-snap")
    ]

    def compile_one(reform):
        program, overrides = reform
        return service.compiled_artifact(program, overrides)[0].read_bytes()

    with ThreadPoolExecutor(max_workers=len(reforms)) as pool:
        got = list(pool.map(compile_one, reforms))
    assert layout.digest() == pristine
    for (program, overrides), actual in zip(reforms, got):
        expected = reference_compile(
            layout.bin_path,
            layout.programs_root / program,
            FAKE_PROGRAMS[program],
            overrides,
            tmp_path / "ref.json",
        )
        assert json.loads(actual) == json.loads(expected)


# -- I5: liveness over HTTP --------------------------------------------------


def test_slow_compile_does_not_block_health_or_baselines(fake_layout, monkeypatch):
    import uvicorn

    monkeypatch.setenv("FAKE_ENGINE_COMPILE_DELAY", "2")
    app = create_app(fake_layout.config())
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.01)
    port = server.servers[0].sockets[0].getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    body = {
        "program": "ny-snap",
        "household": HOUSEHOLD,
        "earnings_max": 1000,
        "earnings_step": 100,
    }
    try:
        with httpx.Client(timeout=30) as client:
            slow = threading.Thread(
                target=httpx.post,
                args=(f"{base}/cliff-sweep",),
                kwargs={"json": {**body, "overrides": max_allotment(1.5)}, "timeout": 30},
            )
            slow.start()
            time.sleep(0.5)  # the override compile is now sleeping
            t0 = time.monotonic()
            assert client.get(f"{base}/health").json()["ok"] is True
            baseline = client.post(f"{base}/cliff-sweep", json=body)
            elapsed = time.monotonic() - t0
            assert baseline.status_code == 200
            assert baseline.json()["points"][0]["snap"] == 298
            assert elapsed < 1.5, f"health + baseline waited {elapsed:.2f}s behind the compile"
            slow.join()
            bad = client.post(
                f"{base}/cliff-sweep",
                json={**body, "overrides": [{"repo": "nope", "file_relative": "x.yaml"}]},
            )
            assert bad.status_code == 400
    finally:
        server.should_exit = True
        thread.join(timeout=5)
