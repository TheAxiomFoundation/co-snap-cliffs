"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
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
  const [reformMultipliers, setReformMultipliers] = useState<Record<string, number>>(
    DEFAULT_MULTIPLIERS,
  );
  const [earningsMax, setEarningsMax] = useState(4000);
  const [step, setStep] = useState(100);
  const [baseline, setBaseline] = useState<SweepResult | null>(null);
  const [reform, setReform] = useState<SweepResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const reformDirty = useMemo(
    () => LEVERS.some((l) => reformMultipliers[l.id] !== 1),
    [reformMultipliers],
  );

  async function fetchSweep(multipliers: Record<string, number>): Promise<SweepResult> {
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
    return (await r.json()) as SweepResult;
  }

  function run() {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const [b, r] = await Promise.all([
          fetchSweep(DEFAULT_MULTIPLIERS()),
          reformDirty ? fetchSweep(reformMultipliers) : Promise.resolve(null),
        ]);
        setBaseline(b);
        setReform(r);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 200);
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household, reformMultipliers, earningsMax, step]);

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
          <div className="shrink-0 font-mono text-[11px] text-ink-muted">computing…</div>
        )}
      </header>

      {err && (
        <div className="mb-6 border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
          {err}
        </div>
      )}

      <div className="grid grid-cols-12 items-start gap-8">
        <aside className="col-span-12 space-y-4 md:sticky md:top-6 md:col-span-4 md:self-start">
          <CompactCard title="Household & sweep">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <CompactNumberRow
                label="Size"
                value={household.household_size}
                min={1}
                max={8}
                step={1}
                onChange={(v) => setHousehold({ ...household, household_size: v })}
              />
              <CompactNumberRow
                label="Oldest age"
                value={household.oldest_member_age}
                min={0}
                max={100}
                step={1}
                onChange={(v) => setHousehold({ ...household, oldest_member_age: v })}
              />
              <CompactNumberRow
                label="Shelter $/mo"
                value={household.monthly_shelter_costs}
                min={0}
                max={3000}
                step={50}
                onChange={(v) => setHousehold({ ...household, monthly_shelter_costs: v })}
              />
              <CompactNumberRow
                label="Resources $"
                value={household.liquid_resources}
                min={0}
                max={5000}
                step={100}
                onChange={(v) => setHousehold({ ...household, liquid_resources: v })}
              />
              <CompactNumberRow
                label="Earnings max"
                value={earningsMax}
                min={1000}
                max={10000}
                step={500}
                onChange={setEarningsMax}
              />
              <CompactNumberRow
                label="Step $"
                value={step}
                min={25}
                max={500}
                step={25}
                onChange={setStep}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-rule pt-3 text-[12px]">
              <InlineCheck
                label="Separate heating/cooling"
                checked={household.pays_separate_heating_or_cooling}
                onChange={(v) =>
                  setHousehold({ ...household, pays_separate_heating_or_cooling: v })
                }
              />
              <InlineCheck
                label="Elderly/disabled member"
                checked={household.any_member_elderly_or_disabled}
                onChange={(v) =>
                  setHousehold({ ...household, any_member_elderly_or_disabled: v })
                }
              />
            </div>
          </CompactCard>

          <CompactCard
            title="Reform parameters"
            rightSlot={
              <button
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted underline-offset-2 hover:text-accent hover:underline"
                onClick={() => setReformMultipliers(DEFAULT_MULTIPLIERS())}
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
                  min={lever.min_multiplier}
                  max={lever.max_multiplier}
                  step={lever.step}
                  value={reformMultipliers[lever.id]}
                  onChange={(v) =>
                    setReformMultipliers({ ...reformMultipliers, [lever.id]: v })
                  }
                />
              ))}
            </div>
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
}: {
  title: string;
  children: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <section className="border border-rule bg-paper-elevated px-3 py-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-rule pb-1.5">
        <h2 className="text-[13px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
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

function CompactNumberRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="truncate text-ink-secondary">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-[72px] px-1.5 py-0.5 text-right font-mono text-[12px]"
      />
    </label>
  );
}

function InlineCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-ink-secondary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5"
      />
      <span>{label}</span>
    </label>
  );
}

function CompactLeverRow({
  label,
  baseline,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  baseline: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const dirty = value !== 1;
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex items-baseline justify-between gap-2 text-[12px] leading-tight">
        <span className="truncate text-ink" title={`baseline · ${baseline}`}>
          {label}
        </span>
        <span
          className={`shrink-0 font-mono text-[11px] ${dirty ? "text-accent" : "text-ink-muted"}`}
        >
          {value.toFixed(2)}×
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
}) {
  return (
    <Card title={title} eyebrow={eyebrow}>
      <ChartLegend reformDirty={reformDirty} />
      <div style={{ width: "100%", height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 18, bottom: 28, left: 6 }}>
            <defs>
              <linearGradient id="delta-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={RULE} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="earnings"
              tickFormatter={dollars}
              stroke={RULE_STRONG}
              strokeWidth={1}
              tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: RULE_STRONG }}
              tickLine={{ stroke: RULE_STRONG }}
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
              strokeWidth={1}
              tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: RULE_STRONG }}
              tickLine={{ stroke: RULE_STRONG }}
              width={56}
              domain={[0, "auto"]}
            />
            <Tooltip
              cursor={{ stroke: INK, strokeWidth: 1, strokeDasharray: "2 2" }}
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
            {referenceLine && (
              <ReferenceLine
                y={referenceLine.y}
                stroke={ERROR}
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{
                  value: referenceLine.label.toUpperCase(),
                  position: "insideTopRight",
                  fill: ERROR,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 9,
                  letterSpacing: "0.18em",
                }}
              />
            )}
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
            />
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
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ChartLegend({ reformDirty }: { reformDirty: boolean }) {
  return (
    <div className="-mt-1 mb-3 flex items-center gap-5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-secondary">
      <span className="flex items-center gap-2">
        <span className="inline-block h-[2px] w-5 bg-ink" />
        baseline · current law
      </span>
      {reformDirty && (
        <span className="flex items-center gap-2 text-accent">
          <span
            className="inline-block h-[2px] w-5"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${ACCENT} 0 4px, transparent 4px 6px)`,
            }}
          />
          reform
        </span>
      )}
    </div>
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

