import { NextResponse } from "next/server";
import { z } from "zod";

import { runCliffSweep } from "@/lib/cliffs";
import { buildOverrides } from "@/lib/parameters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  household: z
    .object({
      household_size: z.number().int().min(1).max(20).optional(),
      monthly_shelter_costs: z.number().min(0).optional(),
      pays_separate_heating_or_cooling: z.boolean().optional(),
      oldest_member_age: z.number().int().min(0).max(110).optional(),
      any_member_elderly_or_disabled: z.boolean().optional(),
      primary_member_is_us_citizen: z.boolean().optional(),
      liquid_resources: z.number().min(0).optional(),
    })
    .default({}),
  earnings_min: z.number().min(0).default(0),
  earnings_max: z.number().min(0).max(20000).default(4000),
  earnings_step: z.number().min(25).max(500).default(100),
  cliff_mtr_threshold: z.number().min(0).max(5).default(1.0),
  parameter_multipliers: z.record(z.string(), z.number()).default({}),
});

export async function POST(req: Request): Promise<Response> {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid request", detail: (err as Error).message },
      { status: 400 },
    );
  }

  try {
    const result = await runCliffSweep({
      household: parsed.household,
      earnings_min: parsed.earnings_min,
      earnings_max: parsed.earnings_max,
      earnings_step: parsed.earnings_step,
      cliff_mtr_threshold: parsed.cliff_mtr_threshold,
      parameter_overrides: buildOverrides(parsed.parameter_multipliers),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "compute failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
