"""Pinned engine + rulespec commits for the cliff explorer's engine service.

One source of truth for ``modal_app.py`` (which bakes these trees into the
Modal image) and ``scripts/setup-service-fixture.py`` (which builds the same
layout locally and in CI for the real-engine tests). Stdlib only: the Modal
container imports it too.

The engine SHA matches the local dev binary (axiom-rules @431039f, mirrored
in the axiom-rules-engine repo) — it must use the canonical
``rulespec-{prefix}`` repo-name resolution the NY compile and the in-place
override path rely on. Each program's rulespec SHAs are bound to its
generated base module (src/lib/programs/<slug>-base.ts); bump them together
and regenerate the base via scripts/generate-program-base.py when upgrading.
The two programs pin *different* federal SHAs for that reason.
"""

AXIOM_RULES_ENGINE_SHA = "431039f02d3fff60cd0c3c074f0ab4318042f002"

# Colorado pair (co-snap-base.ts is bound to these).
RULESPEC_US_CO_FEDERAL_SHA = "2f3a30991e1f8279c2fa664e51f068a63d905591"
RULESPEC_US_CO_SHA = "ba00673d73c19f262d542cfa597b0b365a1313b7"
# New York pair (ny-snap-base.ts is bound to these).
RULESPEC_US_NY_FEDERAL_SHA = "4c24f37420928e5b210e0a5719642ef5d615493f"
RULESPEC_US_NY_SHA = "13456f86822961ddd04d7f3dfa5940223d58c245"

DEFAULT_PROGRAM = "ny-snap"

# slug -> federal SHA, state repo name, state SHA, program YAML path
# (relative to the state repo root).
PROGRAMS = {
    "co-snap": {
        "federal_sha": RULESPEC_US_CO_FEDERAL_SHA,
        "state_repo": "rulespec-us-co",
        "state_sha": RULESPEC_US_CO_SHA,
        "program_rel": "policies/cdhs/snap/fy-2026-benefit-calculation.yaml",
    },
    "ny-snap": {
        "federal_sha": RULESPEC_US_NY_FEDERAL_SHA,
        "state_repo": "rulespec-us-ny",
        "state_sha": RULESPEC_US_NY_SHA,
        "program_rel": "policies/otda/snap/fy-2026-benefit-calculation.yaml",
    },
}
