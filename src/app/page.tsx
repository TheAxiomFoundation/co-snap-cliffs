"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LEVERS } from "@/lib/parameters";
import type { SweepResult } from "@/lib/cliffs";

interface Household {
  household_size: number;
  monthly_shelter_costs: number;
  pays_separate_heating_or_cooling: boolean;
  oldest_member_age: number;
  any_member_elderly_or_disabled: boolean;
  primary_member_is_us_citizen: boolean;
  liquid_resources: number;
}

const DEFAULT_HH: Household = {
  household_size: 1,
  monthly_shelter_costs: 500,
  pays_separate_heating_or_cooling: true,
  oldest_member_age: 30,
  any_member_elderly_or_disabled: false,
  primary_member_is_us_citizen: true,
  liquid_resources: 0,
};

const DEFAULT_MULTIPLIERS = (): Record<string, number> =>
  Object.fromEntries(LEVERS.map((l) => [l.id, 1]));

export default function Page() {
  const [household, setHousehold] = useState<Household>(DEFAULT_HH);
  // Two slider buckets:
  //   `reformMultipliers` is what the user is currently holding (cheap,
  //   updates on every onChange tick — drives the sliders themselves).
  //   `appliedMultipliers` is what's actually been sent to the engine and
  //   reflected on the charts. The Run button promotes pending → applied;
  //   the engine refetch keys off appliedMultipliers.
  const [reformMultipliers, setReformMultipliers] = useState<Record<string, number>>(
    DEFAULT_MULTIPLIERS,
  );
  const [appliedMultipliers, setAppliedMultipliers] = useState<Record<string, number>>(
    DEFAULT_MULTIPLIERS,
  );
  const [earningsMax, setEarningsMax] = useState(4000);
  const [step, setStep] = useState(100);
  const [baseline, setBaseline] = useState<SweepResult | null>(null);
  const [reform, setReform] = useState<SweepResult | null>(null);
  // Loading is a counter, not a boolean: baseline and reform can be in flight
  // independently, so we need to track outstanding fetches and only flip the
  // spinner off when *both* have settled.
  const [loadingCount, setLoadingCount] = useState(0);
  const loading = loadingCount > 0;
  const startLoad = () => setLoadingCount((c) => c + 1);
  const endLoad = () => setLoadingCount((c) => Math.max(0, c - 1));
  const [err, setErr] = useState<string | null>(null);
  const baselineTimer = useRef<number | null>(null);
  const reformTimer = useRef<number | null>(null);
  // Memoization: every successful sweep gets cached by its request signature.
  // Sliding back to a configuration you've already explored returns instantly
  // with no fetch. The cache survives the session; resetting state doesn't
  // clear it.
  const cacheRef = useRef(new Map<string, SweepResult>());
  // Tracks the in-flight request keys so we don't double-fire identical
  // requests during a fast slider drag (the cache only has the *completed*
  // ones).
  const inflightRef = useRef(new Map<string, Promise<SweepResult>>());

  // Chart overlay reflects what's been applied, not what's pending. So
  // `reformDirty` is computed off applied state — same semantics as before
  // the Run button existed.
  const reformDirty = useMemo(
    () => LEVERS.some((l) => appliedMultipliers[l.id] !== 1),
    [appliedMultipliers],
  );

  // `pendingChanges` is the count of levers whose current slider value
  // differs from what's been applied. Drives the Run button enable state.
  const pendingChanges = useMemo(
    () => LEVERS.filter((l) => reformMultipliers[l.id] !== appliedMultipliers[l.id]).length,
    [reformMultipliers, appliedMultipliers],
  );

  function requestSignature(multipliers: Record<string, number>): string {
    return JSON.stringify({
      h: household,
      e: [earningsMax, step],
      m: multipliers,
    });
  }

  async function fetchSweep(multipliers: Record<string, number>): Promise<SweepResult> {
    const key = requestSignature(multipliers);
    const cached = cacheRef.current.get(key);
    if (cached) return cached;
    const inflight = inflightRef.current.get(key);
    if (inflight) return inflight;
    const promise = (async () => {
      const r = await fetch("/api/cliff-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          household,
          earnings_min: 0,
          earnings_max: earningsMax,
          earnings_step: step,
          parameter_multipliers: multipliers,
        }),
      });
      if (!r.ok) throw new Error(`api ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const result = (await r.json()) as SweepResult;
      cacheRef.current.set(key, result);
      return result;
    })();
    inflightRef.current.set(key, promise);
    try {
      return await promise;
    } finally {
      inflightRef.current.delete(key);
    }
  }

  // Baseline depends only on (household, earnings_range). It does NOT change
  // when reform multipliers move — so slider drags don't re-fire it.
  useEffect(() => {
    if (baselineTimer.current) window.clearTimeout(baselineTimer.current);
    baselineTimer.current = window.setTimeout(async () => {
      startLoad();
      setErr(null);
      try {
        setBaseline(await fetchSweep(DEFAULT_MULTIPLIERS()));
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        endLoad();
      }
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household, earningsMax, step]);

  // Reform fires on `appliedMultipliers` — slider drags don't trigger
  // refetches; only clicking Run does (via setAppliedMultipliers).
  useEffect(() => {
    if (reformTimer.current) window.clearTimeout(reformTimer.current);
    if (!reformDirty) {
      setReform(null);
      return;
    }
    reformTimer.current = window.setTimeout(async () => {
      startLoad();
      setErr(null);
      try {
        setReform(await fetchSweep(appliedMultipliers));
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        endLoad();
      }
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household, earningsMax, step, appliedMultipliers, reformDirty]);

  // `run` is the retry handler the error banner button calls.
  function run() {
    cacheRef.current.clear();
    inflightRef.current.clear();
    setErr(null);
    // Trigger both effects by jiggling refs; simpler is just to refetch
    // directly with the current values.
    (async () => {
      startLoad();
      try {
        const b = await fetchSweep(DEFAULT_MULTIPLIERS());
        setBaseline(b);
        if (reformDirty) setReform(await fetchSweep(appliedMultipliers));
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        endLoad();
      }
    })();
  }

  const chartData = useMemo(() => {
    if (!baseline) return [];
    // When reform hasn't been computed yet, seed the reform-series fields from
    // the baseline values. The Reform Line + Area then mount sitting exactly
    // on top of Baseline, and Recharts animates *away* from baseline once the
    // first reform fetch returns — instead of mounting from null and visibly
    // snapping into place on the user's first slider nudge.
    return baseline.points.map((p, i) => {
      const reformPoint = reform?.points[i];
      const baselineMtrPct = p.mtr === null ? null : Math.max(0, p.mtr * 100);
      const reformMtr = reformPoint?.mtr;
      return {
        earnings: p.earnings,
        baseline_snap: p.snap,
        baseline_net: p.net_resources,
        baseline_mtr_pct: baselineMtrPct,
        reform_snap: reformPoint?.snap ?? p.snap,
        reform_net: reformPoint?.net_resources ?? p.net_resources,
        reform_mtr_pct:
          reformMtr === undefined || reformMtr === null
            ? baselineMtrPct
            : Math.max(0, reformMtr * 100),
        baseline_is_cliff: p.is_cliff,
        reform_is_cliff: reformPoint?.is_cliff ?? false,
      };
    });
  }, [baseline, reform]);

  return (
    <main className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-5">
      <header className="mb-6 flex items-end justify-between gap-6 border-b border-rule pb-4">
        <div className="flex items-center gap-4">
          <a href="https://axiomfoundation.org" className="inline-flex w-[108px] shrink-0 no-underline">
            <img
              src="/axiom-foundation.svg"
              alt="Axiom Foundation"
              width={108}
              className="block h-auto w-full"
            />
          </a>
          <div className="border-l border-rule pl-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-ink-muted">
              Interactive · CDHS SNAP FY 2026
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink">
              CO&nbsp;SNAP&nbsp;cliffs
            </h1>
          </div>
        </div>
        {loading && (
          <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
            <Spinner />
            computing
          </div>
        )}
      </header>

      {err && (
        <div className="mb-6 flex items-start justify-between gap-3 border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
          <div>
            <div className="font-medium">{friendlyError(err)}</div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-error/70">
              {err}
            </div>
          </div>
          <button
            onClick={run}
            className="shrink-0 self-center border border-error/40 px-3 py-1 font-mono text-[11px] uppercase tracking-wider hover:bg-error/10"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 items-start gap-8">
        <aside className="col-span-12 space-y-4 md:sticky md:top-6 md:col-span-4 md:self-start">
          <CompactCard title="Household">
            <div className="space-y-2.5">
              <RoomyNumberRow
                label="Household size"
                hint="Number of people in the SNAP unit. Sets which row of the per-size benefit tables (max allotment, deduction, income limits) applies."
                value={household.household_size}
                min={1}
                max={8}
                step={1}
                onChange={(v) => setHousehold({ ...household, household_size: v })}
              />
              <RoomyNumberRow
                label="Oldest member age"
                hint="Age of the oldest household member. 60+ qualifies as elderly under 7 USC 2012, which unlocks the medical-expense deduction and a separate income test path."
                value={household.oldest_member_age}
                min={0}
                max={100}
                step={1}
                onChange={(v) => setHousehold({ ...household, oldest_member_age: v })}
              />
              <RoomyNumberRow
                label="Monthly shelter cost"
                prefix="$"
                hint="Rent or mortgage plus property tax + insurance. Combined with the utility allowance, drives the excess-shelter deduction once shelter exceeds half of net income."
                value={household.monthly_shelter_costs}
                min={0}
                max={3000}
                step={50}
                onChange={(v) => setHousehold({ ...household, monthly_shelter_costs: v })}
              />
              <RoomyNumberRow
                label="Liquid resources"
                prefix="$"
                hint="Cash + bank account balances. Households above the federal resource limit lose SNAP eligibility entirely — a cliff that's separate from income."
                value={household.liquid_resources}
                min={0}
                max={5000}
                step={100}
                onChange={(v) => setHousehold({ ...household, liquid_resources: v })}
              />
            </div>
            <div className="mt-3 space-y-2 border-t border-rule pt-3">
              <RoomyCheck
                label="Separate heating or cooling expense"
                hint="Triggers the largest Standard Utility Allowance ($571 / mo in Colorado FY 2026), which feeds the excess-shelter deduction."
                checked={household.pays_separate_heating_or_cooling}
                onChange={(v) =>
                  setHousehold({ ...household, pays_separate_heating_or_cooling: v })
                }
              />
              <RoomyCheck
                label="Elderly or disabled member"
                hint="Removes the gross-income test and uncaps the excess-shelter deduction — usually a big SNAP boost for qualifying households."
                checked={household.any_member_elderly_or_disabled}
                onChange={(v) =>
                  setHousehold({ ...household, any_member_elderly_or_disabled: v })
                }
              />
            </div>
          </CompactCard>

          <CompactCard title="Earnings sweep">
            <div className="space-y-2.5">
              <RoomyNumberRow
                label="Max earnings"
                prefix="$"
                hint="Upper bound of the income range we sweep across. Pick high enough to clear the gross-income limit so you see the full phase-out."
                value={earningsMax}
                min={1000}
                max={10000}
                step={500}
                onChange={setEarningsMax}
              />
              <RoomyNumberRow
                label="Sweep step"
                prefix="$"
                hint="Resolution of the sweep — smaller steps mean smoother curves but slightly more compute per click."
                value={step}
                min={25}
                max={500}
                step={25}
                onChange={setStep}
              />
            </div>
          </CompactCard>

          <CompactCard
            title="Reform parameters"
            rightSlot={
              <button
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted underline-offset-2 hover:text-accent hover:underline disabled:opacity-40 disabled:no-underline disabled:hover:text-ink-muted"
                onClick={() => {
                  setReformMultipliers(DEFAULT_MULTIPLIERS());
                  setAppliedMultipliers(DEFAULT_MULTIPLIERS());
                }}
                disabled={
                  !reformDirty &&
                  LEVERS.every((l) => reformMultipliers[l.id] === 1)
                }
              >
                reset
              </button>
            }
          >
            <div>
              {LEVERS.map((lever) => (
                <CompactLeverRow
                  key={lever.id}
                  label={lever.label}
                  baseline={lever.baseline_label}
                  hint={lever.description}
                  min={lever.min_multiplier}
                  max={lever.max_multiplier}
                  step={lever.step}
                  value={reformMultipliers[lever.id]}
                  applied={appliedMultipliers[lever.id]}
                  onChange={(v) =>
                    setReformMultipliers({ ...reformMultipliers, [lever.id]: v })
                  }
                />
              ))}
            </div>
            <button
              onClick={() => setAppliedMultipliers(reformMultipliers)}
              disabled={pendingChanges === 0 || loading}
              className="mt-3 flex w-full items-center justify-center gap-2 border border-accent bg-accent px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-paper-elevated transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-rule disabled:bg-rule-subtle disabled:text-ink-muted"
            >
              Run reform
            </button>
          </CompactCard>
        </aside>

        <section className="col-span-12 space-y-3 md:col-span-8">
          <CliffChart
            title="Net resources vs earnings"
            eyebrow="§ I · earnings + SNAP allotment"
            data={chartData}
            baselineKey="baseline_net"
            reformKey="reform_net"
            reformDirty={reformDirty}
            yFormat={dollars}
            valueFormat={dollars}
            yLabel="$ / month"
            loading={loading}
          />

          <CliffChart
            title="SNAP allotment"
            eyebrow="§ II · monthly benefit"
            data={chartData}
            baselineKey="baseline_snap"
            reformKey="reform_snap"
            reformDirty={reformDirty}
            yFormat={dollars}
            valueFormat={dollars}
            yLabel="$ / month"
            loading={loading}
          />

          <CliffChart
            title="Marginal tax rate on SNAP"
            eyebrow="§ III · benefit-loss per additional earned dollar"
            data={chartData}
            baselineKey="baseline_mtr_pct"
            reformKey="reform_mtr_pct"
            reformDirty={reformDirty}
            yFormat={percent}
            valueFormat={percent}
            yLabel="%"
            referenceLine={{ y: 100, label: "cliff threshold" }}
            loading={loading}
          />
        </section>
      </div>
    </main>
  );
}

function Card({
  title,
  children,
  eyebrow,
  computing,
  yUnit,
}: {
  title: string;
  children: React.ReactNode;
  eyebrow?: string;
  computing?: boolean;
  /** Small-caps axis-unit annotation rendered next to the title. */
  yUnit?: string;
}) {
  return (
    <section className="relative border border-rule bg-paper-elevated px-3 py-2.5">
      {computing && <div className="computing-bar" aria-hidden />}
      <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-rule pb-1.5">
        <h2 className="flex items-baseline gap-2 text-[13px] font-bold tracking-[-0.01em] text-ink">
          {title}
          {yUnit && (
            <span className="font-mono text-[9px] font-normal uppercase tracking-[0.22em] text-ink-muted">
              · {yUnit.replace(/\s+/g, " ")}
            </span>
          )}
        </h2>
        {eyebrow && (
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">
            {eyebrow}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function CompactCard({
  title,
  children,
  rightSlot,
}: {
  title: string;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <section className="border border-rule bg-paper-elevated p-3">
      <div className="mb-3 flex items-baseline justify-between border-b border-rule pb-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink">{title}</h2>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}

function Tip({ text }: { text: string }) {
  // Small ⓘ glyph with a CSS-only hover tooltip. Z-index high so it floats
  // over chart cards; positioned above the trigger so it doesn't push layout.
  return (
    <span className="group/tip relative inline-flex items-center">
      <span className="flex h-3.5 w-3.5 cursor-help select-none items-center justify-center rounded-full border border-rule-strong text-[8px] font-bold text-ink-muted transition-colors group-hover/tip:border-accent group-hover/tip:text-accent">
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-60 -translate-x-1/2 border border-rule bg-paper-elevated px-3 py-2 text-[11px] leading-snug text-ink-secondary shadow-md group-hover/tip:block">
        {text}
      </span>
    </span>
  );
}

function RoomyNumberRow({
  label,
  hint,
  prefix,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  /** Visual prefix shown inside the input box (e.g. "$"). */
  prefix?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
        {label}
        {hint && <Tip text={hint} />}
      </span>
      <span className="relative inline-block">
        {prefix && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-ink-muted">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const raw = Number(e.target.value);
            if (!Number.isFinite(raw)) return;
            // Clamp to the declared bounds so the API never sees out-of-range
            // values. Without this, browser type=number lets the user type
            // anything; the request hits Zod and 400s.
            onChange(Math.max(min, Math.min(max, raw)));
          }}
          className={`w-[88px] py-0.5 pr-1.5 text-right font-mono text-[12px] ${
            prefix ? "pl-5" : "pl-1.5"
          }`}
        />
      </span>
    </label>
  );
}

function RoomyCheck({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[12px]">
      <span className="flex items-center gap-1.5 text-ink-secondary">
        {label}
        {hint && <Tip text={hint} />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5"
      />
    </label>
  );
}

function CompactLeverRow({
  label,
  baseline,
  hint,
  min,
  max,
  step,
  value,
  applied,
  onChange,
}: {
  label: string;
  baseline: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  applied: number;
  onChange: (v: number) => void;
}) {
  const dirty = value !== 1;
  const pending = value !== applied;
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex items-baseline justify-between gap-2 text-[12px] leading-tight">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-ink">
          <span className="truncate" title={`baseline · ${baseline}`}>
            {label}
          </span>
          {hint && <Tip text={hint} />}
        </span>
        <span
          className={`shrink-0 font-mono text-[11px] ${
            pending ? "text-accent" : dirty ? "text-accent/70" : "text-ink-muted"
          }`}
        >
          {value.toFixed(2)}×
          {pending && (
            <span className="ml-1 text-[9px] uppercase tracking-wider">pending</span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="!h-[14px]"
      />
    </div>
  );
}

const INK = "#1c1917";
const ACCENT = "#92400e";
const RULE = "#e7e5e4";
const RULE_STRONG = "#78716c";
const ERROR = "#991b1b";

const dollars = (v: number): string =>
  v < 0 ? `-$${Math.abs(Math.round(v)).toLocaleString()}` : `$${Math.round(v).toLocaleString()}`;
const percent = (v: number): string => `${v.toFixed(0)}%`;

function friendlyError(raw: string): string {
  if (/504|FUNCTION_INVOCATION_TIMEOUT|timed?\s*out/i.test(raw)) {
    return "The compute engine took too long to respond. It's probably warming up — try again in a few seconds.";
  }
  if (/\b400\b|invalid request|too_big|too_small|expected/i.test(raw)) {
    return "One of the inputs is out of range. Adjust the offending field and try again.";
  }
  if (/5\d\d/.test(raw)) {
    return "The compute engine returned an error.";
  }
  return "Compute failed.";
}

interface ChartDatum {
  earnings: number;
  baseline_snap: number;
  baseline_net: number;
  baseline_mtr_pct: number | null;
  reform_snap: number | null;
  reform_net: number | null;
  reform_mtr_pct: number | null;
  baseline_is_cliff: boolean;
  reform_is_cliff: boolean;
}

function CliffChart({
  title,
  eyebrow,
  data,
  baselineKey,
  reformKey,
  reformDirty,
  yFormat,
  valueFormat,
  yLabel,
  referenceLine,
  loading,
}: {
  title: string;
  eyebrow: string;
  data: ChartDatum[];
  baselineKey: keyof ChartDatum;
  reformKey: keyof ChartDatum;
  reformDirty: boolean;
  yFormat: (v: number) => string;
  valueFormat: (v: number) => string;
  yLabel: string;
  referenceLine?: { y: number; label: string };
  loading?: boolean;
}) {
  const initialLoading = loading && data.length === 0;
  const lastIdx = data.length - 1;
  const xMax = lastIdx >= 0 ? data[lastIdx].earnings : 0;
  // X-axis tick marks at round $1000 intervals — the auto ticks land on odd
  // numbers as the sweep range varies.
  const xTicks: number[] = [];
  for (let v = 0; v <= xMax; v += 1000) xTicks.push(v);

  return (
    <Card
      title={title}
      eyebrow={eyebrow}
      computing={loading && data.length > 0}
      yUnit={yLabel}
    >
      <div className="relative" style={{ width: "100%", height: 220 }}>
        {initialLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-paper-elevated/90">
            <Spinner />
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
              warming engine
            </div>
          </div>
        )}
        <CornerBrackets />
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 14, right: 78, bottom: 28, left: 14 }}
          >
            <defs>
              <linearGradient id="delta-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.16} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
              </linearGradient>
              <pattern
                id="cliff-hatch"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="6" stroke={ERROR} strokeWidth="1" strokeOpacity="0.18" />
              </pattern>
            </defs>
            <CartesianGrid stroke={RULE} strokeDasharray="1 4" vertical={false} />
            <XAxis
              dataKey="earnings"
              type="number"
              domain={[0, xMax]}
              ticks={xTicks}
              tickFormatter={dollars}
              stroke={RULE_STRONG}
              strokeWidth={0.5}
              tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: RULE_STRONG }}
              tickLine={false}
              label={{
                value: "MONTHLY EARNINGS",
                position: "bottom",
                offset: 14,
                style: {
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  fill: RULE_STRONG,
                  letterSpacing: "0.22em",
                },
              }}
            />
            <YAxis
              tickFormatter={yFormat}
              stroke={RULE_STRONG}
              strokeWidth={0.5}
              tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: RULE_STRONG }}
              tickLine={false}
              width={48}
              domain={[0, "auto"]}
            />
            {/* Cliff zone shading — only on the MTR chart, where the reference
                line is set to 100%. The hatched red rectangle visually
                screams "anything in here is a cliff." */}
            {referenceLine && (
              <ReferenceArea
                y1={referenceLine.y}
                y2={Number.MAX_SAFE_INTEGER}
                fill="url(#cliff-hatch)"
                fillOpacity={1}
                stroke="none"
                ifOverflow="extendDomain"
              />
            )}
            {referenceLine && (
              <ReferenceLine
                y={referenceLine.y}
                stroke={ERROR}
                strokeDasharray="3 3"
                strokeWidth={0.75}
                label={{
                  value: referenceLine.label.toUpperCase(),
                  position: "insideTopRight",
                  fill: ERROR,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  offset: 4,
                }}
              />
            )}
            <Tooltip
              cursor={{ stroke: INK, strokeWidth: 0.75, strokeDasharray: "2 3" }}
              content={(props) => (
                <TooltipCard
                  active={Boolean(props.active)}
                  label={typeof props.label === "number" ? props.label : Number(props.label ?? 0)}
                  payload={
                    Array.isArray(props.payload)
                      ? (props.payload as Array<{
                          name?: string;
                          dataKey?: string;
                          value?: number;
                          color?: string;
                        }>)
                      : []
                  }
                  valueFormat={valueFormat}
                  yLabel={yLabel}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey={reformKey as string}
              stroke="none"
              fill="url(#delta-fill)"
              fillOpacity={reformDirty ? 1 : 0}
              isAnimationActive
              animationDuration={350}
              animationEasing="ease-out"
              activeDot={false}
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey={baselineKey as string}
              name="Baseline"
              stroke={INK}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: ACCENT, stroke: "#faf9f6", strokeWidth: 1.5 }}
              isAnimationActive
              animationDuration={350}
              animationEasing="ease-out"
            >
              <LabelList
                dataKey={baselineKey as string}
                content={(props) => (
                  <SeriesEndLabel
                    {...(props as Record<string, unknown>)}
                    text="BASELINE"
                    color={INK}
                    show={data.length > 0}
                    isLast={(props as { index?: number }).index === lastIdx}
                  />
                )}
              />
            </Line>
            <Line
              type="monotone"
              dataKey={reformKey as string}
              name="Reform"
              stroke={ACCENT}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              strokeOpacity={reformDirty ? 1 : 0}
              dot={false}
              activeDot={
                reformDirty
                  ? { r: 4, fill: ACCENT, stroke: "#faf9f6", strokeWidth: 1.5 }
                  : false
              }
              isAnimationActive
              animationDuration={350}
              animationEasing="ease-out"
            >
              {reformDirty && (
                <LabelList
                  dataKey={reformKey as string}
                  content={(props) => (
                    <SeriesEndLabel
                      {...(props as Record<string, unknown>)}
                      text="REFORM"
                      color={ACCENT}
                      show
                      isLast={(props as { index?: number }).index === lastIdx}
                    />
                  )}
                />
              )}
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Tufte-style direct label on the right edge of the line. Recharts pipes
 *  this through LabelList with the rendered point coords. We only paint at
 *  the last data point so it sits at the line's right end. */
function SeriesEndLabel(props: {
  x?: number;
  y?: number;
  value?: number | null;
  isLast?: boolean;
  show?: boolean;
  text: string;
  color: string;
}) {
  if (!props.isLast || !props.show || props.value == null) return null;
  const x = typeof props.x === "number" ? props.x : 0;
  const y = typeof props.y === "number" ? props.y : 0;
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x + 6}
        y2={y}
        stroke={props.color}
        strokeWidth={0.75}
        strokeOpacity={0.6}
      />
      <text
        x={x + 9}
        y={y}
        fill={props.color}
        fontFamily="JetBrains Mono, monospace"
        fontSize={9}
        letterSpacing="0.18em"
        dominantBaseline="middle"
      >
        {props.text}
      </text>
    </g>
  );
}

/** Small L-shaped tick at each corner of the plot frame. Lives behind the
 *  ResponsiveContainer with absolute positioning so it sits inside the card
 *  padding but outside Recharts' margin box. */
function CornerBrackets() {
  const stroke = RULE_STRONG;
  const sw = 1;
  const len = 8;
  const inset = 2;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <line x1={inset} y1={inset} x2={inset + len} y2={inset} stroke={stroke} strokeWidth={sw} />
      <line x1={inset} y1={inset} x2={inset} y2={inset + len} stroke={stroke} strokeWidth={sw} />
      <line x1={`calc(100% - ${inset + len}px)`} y1={inset} x2={`calc(100% - ${inset}px)`} y2={inset} stroke={stroke} strokeWidth={sw} />
      <line x1={`calc(100% - ${inset}px)`} y1={inset} x2={`calc(100% - ${inset}px)`} y2={inset + len} stroke={stroke} strokeWidth={sw} />
      <line x1={inset} y1={`calc(100% - ${inset}px)`} x2={inset + len} y2={`calc(100% - ${inset}px)`} stroke={stroke} strokeWidth={sw} />
      <line x1={inset} y1={`calc(100% - ${inset + len}px)`} x2={inset} y2={`calc(100% - ${inset}px)`} stroke={stroke} strokeWidth={sw} />
      <line x1={`calc(100% - ${inset + len}px)`} y1={`calc(100% - ${inset}px)`} x2={`calc(100% - ${inset}px)`} y2={`calc(100% - ${inset}px)`} stroke={stroke} strokeWidth={sw} />
      <line x1={`calc(100% - ${inset}px)`} y1={`calc(100% - ${inset + len}px)`} x2={`calc(100% - ${inset}px)`} y2={`calc(100% - ${inset}px)`} stroke={stroke} strokeWidth={sw} />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      className="animate-spin text-accent"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.18"
        fill="none"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function TooltipCard({
  active,
  label,
  payload,
  valueFormat,
  yLabel,
}: {
  active: boolean;
  label: number;
  payload: Array<{ name?: string; dataKey?: string; value?: number; color?: string }>;
  valueFormat: (v: number) => string;
  yLabel: string;
}) {
  if (!active || payload.length === 0) return null;
  return (
    <div className="border border-rule bg-paper-elevated px-3 py-2 shadow-sm">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">
        earnings · ${Math.round(label).toLocaleString()} / mo
      </div>
      {payload.map((p) => (
        <div
          key={p.dataKey}
          className="flex items-baseline justify-between gap-4 font-mono text-xs"
        >
          <span
            className="lowercase tracking-wider"
            style={{ color: p.color === ACCENT ? ACCENT : INK }}
          >
            {p.name}
          </span>
          <span className="tabular-nums" style={{ color: p.color === ACCENT ? ACCENT : INK }}>
            {p.value === undefined || p.value === null ? "—" : valueFormat(p.value)}
            <span className="ml-1 text-[9px] text-ink-muted">{yLabel}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

