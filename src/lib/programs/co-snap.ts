/**
 * Colorado SNAP — typed user-facing fact contract bound to axiom-rules-engine
 * legal IDs. Adapted from finbot-snap-demo, simplified for cliff sweeps.
 *
 * The schema (every input the program reaches, per entity, with dtype) comes
 * from {@link CO_SNAP_BASE}, auto-generated from the compiled program IR.
 */
import { CO_SNAP_BASE } from "./co-snap-base";
import {
  fact,
  monthInterval,
  type ExecutionRequest,
  type FactScalar,
  type InputRecord,
  type RelationRecord,
} from "../engine/types";

export const ARTIFACT_SLUG = "co-snap";

/** Friendly facts the UI cares about. */
export interface CoSnapFacts {
  period?: string;
  household_size?: number;
  monthly_earnings_per_adult?: number;
  monthly_unearned_income?: number;
  monthly_shelter_costs?: number;
  pays_separate_heating_or_cooling?: boolean;
  liquid_resources?: number;
  oldest_member_age?: number;
  any_member_elderly_or_disabled?: boolean;
  primary_member_is_us_citizen?: boolean;
}

type SlotBinding = string | { household?: string[]; person?: string[] };

const FRIENDLY_TO_SLOT: Record<keyof CoSnapFacts, SlotBinding | null> = {
  period: null,
  household_size: "household_size",
  monthly_earnings_per_adult: "employee_wages_received",
  monthly_unearned_income: "assistance_payments",
  monthly_shelter_costs: "household_shelter_costs_incurred",
  pays_separate_heating_or_cooling:
    "household_incurred_or_anticipated_heating_or_cooling_costs_separate_from_rent_or_mortgage",
  liquid_resources: "liquid_resource_current_redemption_rate",
  oldest_member_age: { person: ["member_age"] },
  any_member_elderly_or_disabled: { person: ["snap_member_is_elderly_or_disabled"] },
  primary_member_is_us_citizen: { person: ["member_is_us_citizen"] },
};

const RELATION_MEMBER_OF_HOUSEHOLD =
  "us:statutes/7/2012/j#relation.member_of_household";

const SYNTHETIC_INPUT_PREFIX = "axiom:co-snap-fy-2026#input.";

function legalInputId(slotName: string): string {
  return SYNTHETIC_INPUT_PREFIX + slotName;
}

function resolveDefaults(facts: CoSnapFacts): {
  household_overrides: Record<string, FactScalar>;
  primary_member_overrides: Record<string, FactScalar>;
  resolved: CoSnapFacts;
} {
  const resolved: CoSnapFacts = {
    period: facts.period ?? "2026-01",
    household_size: facts.household_size ?? 1,
    ...facts,
  };
  const household_overrides: Record<string, FactScalar> = {};
  const primary_member_overrides: Record<string, FactScalar> = {};
  for (const [factKey, binding] of Object.entries(FRIENDLY_TO_SLOT)) {
    if (binding == null) continue;
    const value = (resolved as Record<string, unknown>)[factKey];
    if (value === undefined) continue;
    if (typeof binding === "string") {
      household_overrides[binding] = value as FactScalar;
    } else {
      for (const slot of binding.household ?? []) household_overrides[slot] = value as FactScalar;
      for (const slot of binding.person ?? []) primary_member_overrides[slot] = value as FactScalar;
    }
  }
  return { household_overrides, primary_member_overrides, resolved };
}

/** Build an ExecutionRequest covering N earnings-sweep points in a single
 *  engine invocation. Each point becomes its own entity (household:1, ...,
 *  household:N) so we get all results from one binary spawn. */
export function buildSweepRequest(
  baseFacts: CoSnapFacts,
  earningsPoints: number[],
): { request: ExecutionRequest; resolvedPeriod: string } {
  const period = baseFacts.period ?? "2026-01";
  const { interval, period: queryPeriod } = monthInterval(period);

  const inputs: InputRecord[] = [];
  const relations: RelationRecord[] = [];
  const queries = [];

  earningsPoints.forEach((earnings, idx) => {
    const facts: CoSnapFacts = { ...baseFacts, monthly_earnings_per_adult: earnings };
    const { household_overrides, primary_member_overrides, resolved } = resolveDefaults(facts);
    const hhId = `household:${idx + 1}`;
    const size = Math.max(1, Math.floor(resolved.household_size ?? 1));

    for (const slot of CO_SNAP_BASE.household_inputs) {
      const value = (household_overrides[slot.name] ?? slot.default) as FactScalar;
      inputs.push({
        name: legalInputId(slot.name),
        entity: "Household",
        entity_id: hhId,
        interval,
        value: fact(value, slot.dtype as "bool" | "integer" | "decimal" | "date"),
      });
    }
    for (let i = 0; i < size; i++) {
      const personId = `person:${idx + 1}:${i + 1}`;
      relations.push({
        name: RELATION_MEMBER_OF_HOUSEHOLD,
        tuple: [personId, hhId],
        interval,
      });
      const overrides = i === 0 ? primary_member_overrides : {};
      for (const slot of CO_SNAP_BASE.person_inputs) {
        const value = (overrides[slot.name] ?? slot.default) as FactScalar;
        inputs.push({
          name: legalInputId(slot.name),
          entity: "Person",
          entity_id: personId,
          interval,
          value: fact(value, slot.dtype as "bool" | "integer" | "decimal" | "date"),
        });
      }
    }

    queries.push({ entity_id: hhId, period: queryPeriod, outputs: SURFACE_OUTPUT_LEGAL_IDS });
  });

  return {
    request: { mode: "explain", dataset: { inputs, relations }, queries },
    resolvedPeriod: period,
  };
}

/** Outputs we surface per sweep point. */
export const SURFACE_OUTPUTS = [
  "snap_regular_month_allotment",
  "snap_allotment",
  "snap_maximum_allotment",
  "snap_net_income",
  "snap_eligible",
  "snap_income_eligible",
  "snap_resource_eligible",
  "gross_income",
] as const;
export type SurfaceOutputName = (typeof SURFACE_OUTPUTS)[number];

const SURFACE_OUTPUT_LEGAL_IDS: string[] = SURFACE_OUTPUTS.map(
  (name) =>
    CO_SNAP_BASE.outputs_by_name[name as keyof typeof CO_SNAP_BASE.outputs_by_name] ?? name,
);
