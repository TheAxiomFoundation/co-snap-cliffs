/**
 * Program registry — every state SNAP program the explorer can sweep.
 *
 * Each entry binds a typed user-facing fact contract (the friendly facts the
 * UI collects) to the axiom-rules-engine legal IDs of one compiled program.
 * The per-program schema (every input the engine reaches, per entity, with
 * dtype) is auto-generated from the compiled IR — see co-snap-base.ts /
 * ny-snap-base.ts.
 *
 * Notes on engine semantics that shape this file:
 *  - Input references are matched by the `#input.<slot>` fragment; the id
 *    prefix is informational. Output ids in queries must match exactly.
 *  - Some slots appear in BOTH household_inputs and person_inputs (the
 *    engine wants them attached to both entities); the request builder sends
 *    them for every entity list they appear in.
 *  - Relations are asserted person→household for every relation the program
 *    declares (NY declares three; CO one).
 */
import { CO_SNAP_BASE } from "./co-snap-base";
import { NY_SNAP_BASE } from "./ny-snap-base";
import {
  fact,
  monthInterval,
  type ExecutionRequest,
  type FactScalar,
  type InputRecord,
  type RelationRecord,
} from "../engine/types";

export type ProgramSlug = "co-snap" | "ny-snap";
export type StateRepo = "rules-us-co" | "rules-us-ny";
export type NyRegion = "nyc" | "nassau_suffolk" | "rest_of_state";

export const PROGRAM_SLUGS: ProgramSlug[] = ["ny-snap", "co-snap"];
export const DEFAULT_PROGRAM: ProgramSlug = "ny-snap";

/** Friendly facts the UI cares about. State-agnostic except `region`,
 *  which only NY consumes (CO ignores it). */
export interface HouseholdFacts {
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
  region?: NyRegion;
}

export type SlotBinding = string | { household?: string[]; person?: string[] };

interface InputSlot {
  name: string;
  dtype: string;
  default: unknown;
}

export interface ProgramBase {
  schema: string;
  household_inputs: readonly InputSlot[];
  person_inputs: readonly InputSlot[];
  outputs_by_name: Record<string, string>;
}

export interface ProgramSpec {
  slug: ProgramSlug;
  /** Display label for the state selector. */
  label: string;
  /** Which rules-* repo holds the state program (engine/<stateRepo> locally). */
  stateRepo: StateRepo;
  /** Canonical rulespec-* names the scratch patch trees must use — the local
   *  engine derives `us:` / `us-ny:` legal ids from a `rulespec-` path
   *  component after resolving symlinks. */
  scratchUsName: "rulespec-us";
  scratchStateName: "rulespec-us-co" | "rulespec-us-ny";
  /** Program YAML path relative to the state repo root. */
  programRel: string;
  /** Prefix for input legal ids in requests (fragment is what matters). */
  inputPrefix: string;
  base: ProgramBase;
  /** Relations asserted person→household for every household member. */
  relations: readonly string[];
  friendlyToSlot: Record<string, SlotBinding | null>;
  /** Extra household slot values derived from facts (e.g. NY region →
   *  residency booleans). Applied on top of friendlyToSlot bindings. */
  deriveHouseholdOverrides?: (facts: HouseholdFacts) => Record<string, FactScalar>;
  hints: {
    /** Tooltip for the "separate heating or cooling" checkbox. */
    heatingCooling: string;
  };
}

const CO_SPEC: ProgramSpec = {
  slug: "co-snap",
  label: "Colorado",
  stateRepo: "rules-us-co",
  scratchUsName: "rulespec-us",
  scratchStateName: "rulespec-us-co",
  programRel: "policies/cdhs/snap/fy-2026-benefit-calculation.yaml",
  inputPrefix: "axiom:co-snap-fy-2026#input.",
  base: CO_SNAP_BASE as unknown as ProgramBase,
  relations: ["us:statutes/7/2012/j#relation.member_of_household"],
  friendlyToSlot: {
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
  },
  hints: {
    heatingCooling:
      "Triggers the largest Standard Utility Allowance ($571 / mo in Colorado FY 2026), which feeds the excess-shelter deduction.",
  },
};

const NY_SPEC: ProgramSpec = {
  slug: "ny-snap",
  label: "New York",
  stateRepo: "rules-us-ny",
  scratchUsName: "rulespec-us",
  scratchStateName: "rulespec-us-ny",
  programRel: "policies/otda/snap/fy-2026-benefit-calculation.yaml",
  inputPrefix: NY_SNAP_BASE.input_prefix,
  base: NY_SNAP_BASE as unknown as ProgramBase,
  relations: NY_SNAP_BASE.relations,
  friendlyToSlot: {
    period: null,
    household_size: "household_size",
    // NY's worksheet-style program takes both the gross and countable
    // earned/unearned figures as inputs; the demo has no exclusions, so the
    // same value feeds both slots.
    monthly_earnings_per_adult: {
      household: ["snap_gross_monthly_earned_income", "snap_countable_earned_income"],
    },
    monthly_unearned_income: {
      household: ["snap_total_monthly_unearned_income", "snap_countable_unearned_income"],
    },
    monthly_shelter_costs: "household_shelter_costs_incurred",
    pays_separate_heating_or_cooling:
      "household_incurred_or_anticipated_heating_or_cooling_costs_separate_from_rent_or_mortgage",
    liquid_resources: "snap_countable_financial_resources",
    oldest_member_age: { person: ["member_age"] },
    any_member_elderly_or_disabled: { person: ["snap_member_is_elderly_or_disabled"] },
    primary_member_is_us_citizen: { person: ["member_is_us_citizen"] },
  },
  deriveHouseholdOverrides: (facts) => {
    const region: NyRegion = facts.region ?? "nyc";
    return {
      household_resides_in_new_york_city: region === "nyc",
      household_resides_in_nassau_or_suffolk_county: region === "nassau_suffolk",
      // 18 NYCRR 387.14(a)(5)(d): the 150% FPL expanded categorical path
      // only applies to households with earned income budgeted for SNAP.
      // The sweep varies earnings, so derive the flag from the sweep point.
      household_has_earned_income_budgeted_for_snap:
        (facts.monthly_earnings_per_adult ?? 0) > 0,
    };
  },
  hints: {
    heatingCooling:
      "Triggers New York's heating/cooling Standard Utility Allowance — $1,062 / mo in NYC, $988 in Nassau & Suffolk, $877 in the rest of the state (FY 2026) — which feeds the excess-shelter deduction.",
  },
};

export const PROGRAMS: Record<ProgramSlug, ProgramSpec> = {
  "co-snap": CO_SPEC,
  "ny-snap": NY_SPEC,
};

/** Outputs we surface per sweep point (short names; programs expose a
 *  subset — ids are looked up per program and absent names are skipped). */
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

export function surfaceOutputIds(spec: ProgramSpec): string[] {
  return SURFACE_OUTPUTS.filter((name) => name in spec.base.outputs_by_name).map(
    (name) => spec.base.outputs_by_name[name],
  );
}

function resolveDefaults(
  spec: ProgramSpec,
  facts: HouseholdFacts,
): {
  household_overrides: Record<string, FactScalar>;
  primary_member_overrides: Record<string, FactScalar>;
  resolved: HouseholdFacts;
} {
  const resolved: HouseholdFacts = {
    period: facts.period ?? "2026-01",
    household_size: facts.household_size ?? 1,
    ...facts,
  };
  const household_overrides: Record<string, FactScalar> = {};
  const primary_member_overrides: Record<string, FactScalar> = {};
  for (const [factKey, binding] of Object.entries(spec.friendlyToSlot)) {
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
  if (spec.deriveHouseholdOverrides) {
    Object.assign(household_overrides, spec.deriveHouseholdOverrides(resolved));
  }
  return { household_overrides, primary_member_overrides, resolved };
}

/** Build an ExecutionRequest covering N earnings-sweep points in a single
 *  engine invocation. Each point becomes its own entity (household:1, ...,
 *  household:N) so we get all results from one binary spawn. */
export function buildSweepRequest(
  spec: ProgramSpec,
  baseFacts: HouseholdFacts,
  earningsPoints: number[],
): { request: ExecutionRequest; resolvedPeriod: string } {
  const period = baseFacts.period ?? "2026-01";
  const { interval, period: queryPeriod } = monthInterval(period);
  const outputIds = surfaceOutputIds(spec);

  const inputs: InputRecord[] = [];
  const relations: RelationRecord[] = [];
  const queries: ExecutionRequest["queries"] = [];

  earningsPoints.forEach((earnings, idx) => {
    const facts: HouseholdFacts = { ...baseFacts, monthly_earnings_per_adult: earnings };
    const { household_overrides, primary_member_overrides, resolved } = resolveDefaults(
      spec,
      facts,
    );
    const hhId = `household:${idx + 1}`;
    const size = Math.max(1, Math.floor(resolved.household_size ?? 1));

    for (const slot of spec.base.household_inputs) {
      const value = (household_overrides[slot.name] ?? slot.default) as FactScalar;
      inputs.push({
        name: spec.inputPrefix + slot.name,
        entity: "Household",
        entity_id: hhId,
        interval,
        value: fact(value, slot.dtype as "bool" | "integer" | "decimal" | "date"),
      });
    }
    for (let i = 0; i < size; i++) {
      const personId = `person:${idx + 1}:${i + 1}`;
      for (const relation of spec.relations) {
        relations.push({ name: relation, tuple: [personId, hhId], interval });
      }
      const overrides = i === 0 ? primary_member_overrides : {};
      for (const slot of spec.base.person_inputs) {
        const value = (overrides[slot.name] ?? slot.default) as FactScalar;
        inputs.push({
          name: spec.inputPrefix + slot.name,
          entity: "Person",
          entity_id: personId,
          interval,
          value: fact(value, slot.dtype as "bool" | "integer" | "decimal" | "date"),
        });
      }
    }

    queries.push({ entity_id: hhId, period: queryPeriod, outputs: outputIds });
  });

  return {
    request: { mode: "explain", dataset: { inputs, relations }, queries },
    resolvedPeriod: period,
  };
}
