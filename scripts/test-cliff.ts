/**
 * Smoke test for the cliff sweep. Runs a baseline (no parameter overrides)
 * single-person household across $0–$2000/mo wages and reports timing,
 * sample points, and cliff summary. Exits non-zero if anything looks off.
 *
 * Usage: bun run cliff:test
 */
import { runCliffSweep } from "../src/lib/cliffs";

async function main(): Promise<void> {
  console.log("→ baseline sweep, single adult age 30, $500 shelter");
  const result = await runCliffSweep({
    household: {
      household_size: 1,
      monthly_shelter_costs: 500,
      pays_separate_heating_or_cooling: true,
      oldest_member_age: 30,
      primary_member_is_us_citizen: true,
      liquid_resources: 0,
    },
    earnings_min: 0,
    earnings_max: 2000,
    earnings_step: 100,
  });

  console.log(`    ${result.points.length} points in ${result.ms} ms`);
  console.log("    summary:", result.summary);
  console.log("    sample points:");
  for (const p of result.points.filter((_, i) => i % 4 === 0)) {
    const mtr = p.mtr === null ? "—" : (p.mtr * 100).toFixed(1) + "%";
    const flag = p.is_cliff ? " ← CLIFF" : "";
    console.log(
      `      $${String(p.earnings).padStart(5)} → SNAP $${String(p.snap).padStart(4)}  mtr=${mtr.padStart(7)}${flag}`,
    );
  }

  if (result.points[0].snap < 100 || result.points[0].snap > 400) {
    console.error("FAIL: SNAP at $0 earnings looks wrong:", result.points[0].snap);
    process.exit(1);
  }
  console.log("ok");

  console.log("\n→ reform sweep: 50% cut to standard deduction");
  const reform = await runCliffSweep({
    household: {
      household_size: 1,
      monthly_shelter_costs: 500,
      pays_separate_heating_or_cooling: true,
      oldest_member_age: 30,
      primary_member_is_us_citizen: true,
      liquid_resources: 0,
    },
    earnings_min: 0,
    earnings_max: 2000,
    earnings_step: 100,
    parameter_overrides: [
      {
        repo: "rules-us",
        file_relative: "policies/usda/snap/fy-2026-cola/deductions.yaml",
        parameter: "snap_standard_deduction_48_states_dc_table",
        patch: { kind: "scale_values", multiplier: 0.5 },
      },
    ],
  });

  console.log(`    ${reform.points.length} points in ${reform.ms} ms`);
  console.log("    summary:", reform.summary);
  console.log("    sample points:");
  for (const p of reform.points.filter((_, i) => i % 4 === 0)) {
    const mtr = p.mtr === null ? "—" : (p.mtr * 100).toFixed(1) + "%";
    const flag = p.is_cliff ? " ← CLIFF" : "";
    console.log(
      `      $${String(p.earnings).padStart(5)} → SNAP $${String(p.snap).padStart(4)}  mtr=${mtr.padStart(7)}${flag}`,
    );
  }

  // At $0 earnings, std deduction doesn't matter (net income floors at 0).
  // Check a mid-earnings point where the cut should bite.
  const baselineMid = result.points.find((p) => p.earnings === 1200)?.snap ?? 0;
  const reformMid = reform.points.find((p) => p.earnings === 1200)?.snap ?? 0;
  if (reformMid >= baselineMid) {
    console.error(
      `FAIL: at $1200 earnings, reform should give less SNAP than baseline — reform=$${reformMid} baseline=$${baselineMid}`,
    );
    process.exit(1);
  }
  console.log(
    `ok — at $1200 earnings, std-deduction cut drops SNAP from $${baselineMid} to $${reformMid}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
