/**
 * Smoke test for the cliff sweep. Runs a baseline (no parameter overrides)
 * single-person household across $0–$2000/mo wages and reports timing,
 * sample points, and cliff summary. Exits non-zero if anything looks off.
 *
 * Also exercises every adjustable lever in src/lib/parameters.ts so that a
 * misnamed parameter id or wrong file path surfaces here, before it hits the
 * UI as a 500 from the API route.
 *
 * Usage: bun run cliff:test
 */
import { runCliffSweep } from "../src/lib/cliffs";
import { LEVERS } from "../src/lib/parameters";

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

  console.log("\n→ all levers — single-multiplier sweep to catch misnamed params");
  for (const lever of LEVERS) {
    try {
      const r = await runCliffSweep({
        household: { household_size: 1, oldest_member_age: 30 },
        earnings_min: 0,
        earnings_max: 800,
        earnings_step: 400,
        parameter_overrides: lever.build_overrides(1.1),
      });
      console.log(
        `      ok  ${lever.id.padEnd(38)} → ${r.points.length} pts, $${r.points[0].snap} @ $0`,
      );
    } catch (e) {
      console.error(`      FAIL ${lever.id}: ${(e as Error).message.split("\n")[0]}`);
      process.exit(1);
    }
  }
  console.log("ok — every lever compiles and runs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
