/**
 * Adjustable parameter catalog — the levers the UI exposes.
 *
 * Each lever is a self-contained spec: where the parameter lives, how to patch
 * it, and how the UI should render it (label, min/max, step, current
 * baseline value for display).
 *
 * Levers fall into two flavors:
 *   - `scalar`: a single number knob → maps to `scale_formula` (multiplier
 *     applied to a numeric-literal formula) when `mode === "scale"`, or
 *     `set_formula` when `mode === "set"`.
 *   - `table`: a multiplier applied to all values of an indexed parameter
 *     (e.g. max allotment by household size) → `scale_values`.
 *
 * Baseline values are inlined here so the UI doesn't have to re-read the YAML
 * just to render sliders. If a baseline drifts, regenerate or update by hand.
 */
import type { ParameterOverride } from "./engine/patch-params";

export interface LeverSpec {
  id: string;
  group: "income-limits" | "max-allotment" | "deductions" | "bbce";
  label: string;
  description: string;
  baseline_label: string;
  /** UI slider: multiplier on the baseline. 1.0 = no change. */
  min_multiplier: number;
  max_multiplier: number;
  step: number;
  /** How to translate (multiplier) → ParameterOverride[]. */
  build_overrides: (multiplier: number) => ParameterOverride[];
}

const US_DEDUCTIONS = "policies/usda/snap/fy-2026-cola/deductions.yaml";
const US_INCOME = "policies/usda/snap/fy-2026-cola/income-eligibility-standards.yaml";
const US_MAX_ALLOTMENT = "policies/usda/snap/fy-2026-cola/maximum-allotments.yaml";
// Colorado BBCE expanded gross-income limit lives in 4.401.1 in the CO repo.
const CO_BBCE = "regulations/10-ccr-2506-1/4.401.1.yaml";

export const LEVERS: LeverSpec[] = [
  {
    id: "max_allotment_scale",
    group: "max-allotment",
    label: "Max allotment (48 states + DC)",
    description: "Scale every row of the maximum allotment table by household size.",
    baseline_label: "1-person: $298 / mo",
    min_multiplier: 0.5,
    max_multiplier: 2,
    step: 0.05,
    build_overrides: (m) => [
      {
        repo: "rules-us",
        file_relative: US_MAX_ALLOTMENT,
        parameter: "snap_maximum_allotment_table",
        patch: { kind: "scale_values", multiplier: m },
      },
      {
        repo: "rules-us",
        file_relative: US_MAX_ALLOTMENT,
        parameter: "snap_maximum_allotment_additional_member",
        patch: { kind: "scale_formula", multiplier: m },
      },
    ],
  },
  {
    id: "standard_deduction_scale",
    group: "deductions",
    label: "Standard deduction",
    description: "Scale the SNAP standard deduction table.",
    baseline_label: "1–3 person: $204 / mo",
    min_multiplier: 0,
    max_multiplier: 2,
    step: 0.05,
    build_overrides: (m) => [
      {
        repo: "rules-us",
        file_relative: US_DEDUCTIONS,
        parameter: "snap_standard_deduction_48_states_dc_table",
        patch: { kind: "scale_values", multiplier: m },
      },
    ],
  },
  {
    id: "earned_income_deduction_scale",
    group: "deductions",
    label: "Earned income deduction (20%)",
    description: "Scale the 20% deduction applied to gross earned income.",
    baseline_label: "20% of earnings",
    min_multiplier: 0,
    max_multiplier: 2,
    step: 0.05,
    build_overrides: (m) => [
      {
        repo: "rules-us",
        file_relative: US_DEDUCTIONS,
        parameter: "snap_earned_income_deduction_percent",
        patch: { kind: "scale_formula", multiplier: m },
      },
    ],
  },
  {
    id: "gross_income_limit_scale",
    group: "income-limits",
    label: "Gross income limit (130% FPL)",
    description: "Scale the 130% FPL gross income eligibility threshold table.",
    baseline_label: "1-person: $1,696 / mo",
    min_multiplier: 0.5,
    max_multiplier: 2,
    step: 0.05,
    build_overrides: (m) => [
      {
        repo: "rules-us",
        file_relative: US_INCOME,
        parameter: "snap_gross_income_limit_130_percent_fpl_48_states_dc_table",
        patch: { kind: "scale_values", multiplier: m },
      },
    ],
  },
  {
    id: "net_income_limit_scale",
    group: "income-limits",
    label: "Net income limit (100% FPL)",
    description: "Scale the 100% FPL net income eligibility threshold table.",
    baseline_label: "1-person: $1,305 / mo",
    min_multiplier: 0.5,
    max_multiplier: 2,
    step: 0.05,
    build_overrides: (m) => [
      {
        repo: "rules-us",
        file_relative: US_INCOME,
        parameter: "snap_net_income_limit_100_percent_fpl_48_states_dc_table",
        patch: { kind: "scale_values", multiplier: m },
      },
    ],
  },
  {
    id: "co_bbce_limit_scale",
    group: "bbce",
    label: "Colorado BBCE gross-income limit",
    description: "Scale Colorado's expanded categorical-eligibility gross-income limit.",
    baseline_label: "200% FPL",
    min_multiplier: 0.5,
    max_multiplier: 2,
    step: 0.05,
    build_overrides: (m) => [
      {
        repo: "rules-us-co",
        file_relative: CO_BBCE,
        parameter: "co_snap_expanded_categorical_gross_income_limit_table",
        patch: { kind: "scale_values", multiplier: m },
      },
    ],
  },
];

export function buildOverrides(multipliers: Record<string, number>): ParameterOverride[] {
  const overrides: ParameterOverride[] = [];
  for (const lever of LEVERS) {
    const m = multipliers[lever.id];
    if (m === undefined || m === 1) continue;
    overrides.push(...lever.build_overrides(m));
  }
  return overrides;
}
