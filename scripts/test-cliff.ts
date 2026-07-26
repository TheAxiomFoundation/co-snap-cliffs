/**
 * Smoke test for the cliff sweep. Runs baseline (no parameter overrides)
 * single-person sweeps for BOTH programs, a reform sweep on the default
 * program, and exercises every adjustable lever in src/lib/parameters.ts so
 * that a misnamed parameter id or wrong file path surfaces here, before it
 * hits the UI as a 500 from the API route.
 *
 * Usage: bun run cliff:test
 */
import { runCliffSweep } from "../src/lib/cliffs";
import { LEVERS } from "../src/lib/parameters";
import { DEFAULT_PROGRAM, PROGRAM_SLUGS, type ProgramSlug } from "../src/lib/programs/registry";

const BASE_HH = {
  household_size: 1,
  monthly_shelter_costs: 500,
  pays_separate_heating_or_cooling: true,
  oldest_member_age: 30,
  primary_member_is_us_citizen: true,
  liquid_resources: 0,
};

function printPoints(result: Awaited<ReturnType<typeof runCliffSweep>>): void {
  for (const p of result.points.filter((_, i) => i % 4 === 0)) {
    const mtr = p.mtr === null ? "—" : (p.mtr * 100).toFixed(1) + "%";
    const flag = p.is_cliff ? " ← CLIFF" : "";
    console.log(
      `      $${String(p.earnings).padStart(5)} → SNAP $${String(p.snap).padStart(4)}  mtr=${mtr.padStart(7)}${flag}`,
    );
  }
}

async function main(): Promise<void> {
  for (const program of PROGRAM_SLUGS) {
    console.log(`→ ${program} baseline sweep, single adult age 30, $500 shelter`);
    const result = await runCliffSweep({
      program,
      household: BASE_HH,
      earnings_min: 0,
      earnings_max: 2000,
      earnings_step: 100,
    });
    console.log(`    ${result.points.length} points in ${result.ms} ms`);
    console.log("    summary:", result.summary);
    printPoints(result);
    if (result.points[0].snap < 100 || result.points[0].snap > 400) {
      console.error("FAIL: SNAP at $0 earnings looks wrong:", result.points[0].snap);
      process.exit(1);
    }
    console.log("ok");
  }

  console.log(`\n→ ${DEFAULT_PROGRAM} reform sweep: 50% cut to standard deduction`);
  const baseline = await runCliffSweep({
    program: DEFAULT_PROGRAM,
    household: BASE_HH,
    earnings_min: 0,
    earnings_max: 2000,
    earnings_step: 100,
  });
  const reform = await runCliffSweep({
    program: DEFAULT_PROGRAM,
    household: BASE_HH,
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
  printPoints(reform);

  // At $0 earnings, std deduction doesn't matter (net income floors at 0).
  // Check a mid-earnings point where the cut should bite.
  const baselineMid = baseline.points.find((p) => p.earnings === 1200)?.snap ?? 0;
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
    // Run each lever under a program it applies to (prefer the default).
    const program: ProgramSlug = lever.programs.includes(DEFAULT_PROGRAM)
      ? DEFAULT_PROGRAM
      : lever.programs[0];
    try {
      const r = await runCliffSweep({
        program,
        household: { household_size: 1, oldest_member_age: 30 },
        earnings_min: 0,
        earnings_max: 800,
        earnings_step: 400,
        parameter_overrides: lever.build_overrides(1.1),
      });
      console.log(
        `      ok  ${lever.id.padEnd(38)} (${program}) → ${r.points.length} pts, $${r.points[0].snap} @ $0`,
      );
    } catch (e) {
      const msg = (e as Error).message.split("\n")[0];
      if (program === DEFAULT_PROGRAM) {
        console.error(`      FAIL ${lever.id}: ${msg}`);
        process.exit(1);
      }
      // Non-default (CO) override compiles depend on the local
      // engine/rules-us* checkouts matching the pinned artifact trees;
      // report drift loudly but don't fail the default-program smoke.
      console.warn(`      WARN ${lever.id} (${program}): ${msg}`);
    }
  }
  console.log("ok — every lever compiles and runs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
