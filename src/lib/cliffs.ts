/**
 * Cliff sweep — evaluate CO SNAP across an earnings range and detect cliffs.
 *
 * Strategy: build one ExecutionRequest with N entity_ids (one per earnings
 * point) so we get all results from a single engine spawn. The engine runs
 * each entity independently because the rules don't reference cross-entity
 * facts. This keeps a 40-point sweep under ~1s on local.
 *
 * Net resources for v1 is earnings + SNAP allotment (per the user's "SNAP
 * only" scope decision — no taxes). MTR on net resources between consecutive
 * earnings points is:
 *   mtr = 1 - delta_net / delta_earnings = -delta_snap / delta_earnings
 * so MTR > 0 means SNAP fell as earnings rose; MTR ≥ 100% means SNAP fell by
 * more than the earnings increment (a true cliff: more earnings, less net).
 */
import { runEngine } from "./engine/run";
import {
  ARTIFACT_SLUG,
  buildSweepRequest,
  SURFACE_OUTPUTS,
  type CoSnapFacts,
  type SurfaceOutputName,
} from "./programs/co-snap";
import { CO_SNAP_BASE } from "./programs/co-snap-base";
import { readOutput, type OutputValue } from "./engine/types";
import type { ParameterOverride } from "./engine/patch-params";

export interface SweepPoint {
  earnings: number;
  snap: number;
  net_resources: number; // = snap for v1
  eligible: boolean;
  mtr: number | null; // null at first point
  is_cliff: boolean;
}

export interface CliffSummary {
  cliff_count: number;
  max_mtr: number;
  /** share of consecutive intervals where MTR > 100% */
  cliff_share: number;
  total_snap_at_zero_earnings: number;
}

export interface SweepResult {
  points: SweepPoint[];
  summary: CliffSummary;
  ms: number;
}

export interface SweepOptions {
  household: CoSnapFacts;
  earnings_min?: number;
  earnings_max?: number;
  earnings_step?: number;
  parameter_overrides?: ParameterOverride[];
  cliff_mtr_threshold?: number; // default 1.0 (100%)
}

const DEFAULTS = {
  earnings_min: 0,
  earnings_max: 4000, // monthly wages, in dollars
  earnings_step: 100,
  cliff_mtr_threshold: 1.0,
};

export async function runCliffSweep(opts: SweepOptions): Promise<SweepResult> {
  const start = Date.now();
  const min = opts.earnings_min ?? DEFAULTS.earnings_min;
  const max = opts.earnings_max ?? DEFAULTS.earnings_max;
  const step = opts.earnings_step ?? DEFAULTS.earnings_step;
  const threshold = opts.cliff_mtr_threshold ?? DEFAULTS.cliff_mtr_threshold;
  const overrides = opts.parameter_overrides ?? [];

  // Production fast path: send a ~150-byte payload to Modal's /cliff-sweep
  // endpoint; Modal builds the engine request server-side, runs, returns
  // the full SweepResult. Saves ~100 KB of upload + a JSON round-trip on
  // both ends compared to assembling the request on Vercel.
  const ENGINE_URL = process.env.AXIOM_ENGINE_URL?.replace(/\/$/, "");
  if (ENGINE_URL) {
    const r = await fetch(`${ENGINE_URL}/cliff-sweep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        program: ARTIFACT_SLUG,
        household: opts.household,
        earnings_min: min,
        earnings_max: max,
        earnings_step: step,
        cliff_mtr_threshold: threshold,
        overrides,
      }),
    });
    if (!r.ok) throw new Error(`axiom-engine ${r.status}: ${(await r.text()).slice(0, 500)}`);
    const result = (await r.json()) as SweepResult;
    return { ...result, ms: Date.now() - start };
  }

  // Local-dev path: spawn the binary directly, assemble the request in TS,
  // run, post-process. Unchanged from before.
  const earningsPoints: number[] = [];
  for (let e = min; e <= max; e += step) earningsPoints.push(e);

  const { request } = buildSweepRequest(opts.household, earningsPoints);
  const response = await runEngine(ARTIFACT_SLUG, request, overrides);

  const idForOutput = (name: SurfaceOutputName): string =>
    (CO_SNAP_BASE.outputs_by_name as Record<string, string>)[name] ?? name;

  const points: SweepPoint[] = response.results.map((r, idx) => {
    const get = (name: SurfaceOutputName): OutputValue | undefined => r.outputs[idForOutput(name)];
    const snapOut = get("snap_regular_month_allotment") ?? get("snap_allotment");
    const eligOut = get("snap_eligible");
    const snap =
      snapOut && snapOut.kind === "scalar"
        ? (readOutput(snapOut).numeric ?? 0)
        : 0;
    const eligible =
      eligOut && eligOut.kind === "judgment" ? eligOut.outcome === "holds" : snap > 0;
    return {
      earnings: earningsPoints[idx],
      snap,
      net_resources: earningsPoints[idx] + snap,
      eligible,
      mtr: null,
      is_cliff: false,
    };
  });

  for (let i = 1; i < points.length; i++) {
    const dE = points[i].earnings - points[i - 1].earnings;
    const dSnap = points[i].snap - points[i - 1].snap;
    if (dE > 0) {
      const mtr = -dSnap / dE;
      points[i].mtr = mtr;
      points[i].is_cliff = mtr >= threshold;
    }
  }

  const mtrs = points.slice(1).map((p) => p.mtr ?? 0);
  const cliffCount = points.filter((p) => p.is_cliff).length;
  const summary: CliffSummary = {
    cliff_count: cliffCount,
    max_mtr: mtrs.length ? Math.max(...mtrs) : 0,
    cliff_share: mtrs.length ? cliffCount / mtrs.length : 0,
    total_snap_at_zero_earnings: points[0]?.snap ?? 0,
  };

  return { points, summary, ms: Date.now() - start };
}
