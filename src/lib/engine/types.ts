/**
 * Shared types for the Axiom rules engine wire protocol.
 */
export type FactScalar = boolean | number | string;

export type FactValue =
  | { kind: "bool"; value: boolean }
  | { kind: "integer"; value: number }
  | { kind: "decimal"; value: string }
  | { kind: "text"; value: string }
  | { kind: "date"; value: string };

export interface Interval {
  start: string;
  end: string;
}

export interface InputRecord {
  name: string;
  entity: "Household" | "Person" | string;
  entity_id: string;
  interval: Interval;
  value: FactValue;
}

export interface RelationRecord {
  name: string;
  tuple: [string, string];
  interval: Interval;
}

export interface QueryRequest {
  entity_id: string;
  period: { period_kind: "month" | "year"; start: string; end: string };
  outputs: string[];
}

export interface ExecutionRequest {
  mode: "fast" | "explain";
  dataset: { inputs: InputRecord[]; relations: RelationRecord[] };
  queries: QueryRequest[];
}

type Outcome = "holds" | "not_holds";

export type OutputValue =
  | {
      kind: "scalar";
      name: string;
      id: string;
      dtype: string;
      unit?: string | null;
      value: { kind: string; value: string | number | boolean };
    }
  | { kind: "judgment"; name: string; id: string; unit?: string | null; outcome: Outcome };

export interface ExecutionResponse {
  metadata: { requested_mode: string; actual_mode: string; fallback_reason: string | null };
  results: Array<{
    entity_id: string;
    period: { period_kind: string; start: string; end: string };
    outputs: Record<string, OutputValue>;
    trace?: Record<string, unknown>;
  }>;
}

export function fact(value: FactScalar, dtype?: "bool" | "integer" | "decimal" | "date" | "text"): FactValue {
  if (dtype === "bool") return { kind: "bool", value: Boolean(value) };
  if (dtype === "integer") return { kind: "integer", value: Math.round(Number(value)) };
  if (dtype === "decimal") return { kind: "decimal", value: String(Number(value)) };
  if (dtype === "date") return { kind: "date", value: String(value) };
  if (dtype === "text") return { kind: "text", value: String(value) };
  if (typeof value === "boolean") return { kind: "bool", value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { kind: "integer", value };
    return { kind: "decimal", value: String(value) };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { kind: "date", value };
  return { kind: "text", value };
}

export function monthInterval(period: string): {
  interval: Interval;
  period: { period_kind: "month"; start: string; end: string };
} {
  const [yStr, mStr] = period.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const start = `${period}-01`;
  const endY = m === 12 ? y + 1 : y;
  const endM = m === 12 ? 1 : m + 1;
  const end = `${endY.toString().padStart(4, "0")}-${endM.toString().padStart(2, "0")}-01`;
  return { interval: { start, end }, period: { period_kind: "month", start, end } };
}

export function readOutput(out: OutputValue): {
  kind: "scalar" | "judgment";
  numeric?: number;
  outcome?: Outcome;
} {
  if (out.kind === "judgment") return { kind: "judgment", outcome: out.outcome };
  const v = out.value.value;
  const n = typeof v === "number" ? v : Number(v);
  return { kind: "scalar", numeric: Number.isFinite(n) ? n : undefined };
}
