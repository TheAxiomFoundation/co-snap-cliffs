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
    return baseline.points.map((p, i) => ({
      earnings: p.earnings,
      baseline_snap: p.snap,
      baseline_net: p.net_resources,
      baseline_mtr_pct: p.mtr === null ? null : Math.max(0, p.mtr * 100),
      reform_snap: reform?.points[i]?.snap ?? null,
      reform_net: reform?.points[i]?.net_resources ?? null,
      reform_mtr_pct:
        reform?.points[i]?.mtr === undefined || reform?.points[i]?.mtr === null
          ? null
          : Math.max(0, (reform!.points[i].mtr as number) * 100),
      baseline_is_cliff: p.is_cliff,
      reform_is_cliff: reform?.points[i]?.is_cliff ?? false,
    }));
  }, [baseline, reform]);

  return (
    <main className="relative z-10 mx-auto max-w-7xl px-6 pb-16 pt-10">
      <nav className="mb-12 flex items-center gap-3">
        <a href="https://axiomfoundation.org" className="inline-flex w-[132px] no-underline">
          <img
            src="/axiom-foundation.svg"
            alt="Axiom Foundation"
            width={132}
            className="block w-full h-auto"
          />
        </a>
        <span className="ml-2 text-xs uppercase tracking-[0.18em] text-ink-muted">
          / co snap cliffs
        </span>
      </nav>

      <header className="mb-10 flex items-end justify-between border-b border-rule pb-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-muted">
            Interactive · Colorado Department of Human Services · SNAP FY 2026
          </div>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em] text-ink">
            CO&nbsp;SNAP&nbsp;cliffs
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-secondary">
            Adjust Colorado SNAP policy levers and watch the benefit-cliff
            structure change in real time. Every dollar comes from a live
            compute against <code className="font-mono text-[12px] text-accent">axiom-rules-engine</code>{" "}
            executing the encoded CO SNAP composition — no model recall, no
            PolicyEngine.
          </p>
        </div>
        <div className="font-mono text-[11px] text-ink-muted">
          {loading
            ? "computing…"
            : baseline && (
                <>
                  baseline {baseline.ms}&thinsp;ms
                  {reform && <> · reform {reform.ms}&thinsp;ms</>}
                </>
              )}
        </div>
      </header>

      {err && (
        <div className="mb-6 border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
          {err}
        </div>
      )}

      <div className="grid grid-cols-12 gap-8">
        <aside className="col-span-12 space-y-6 md:col-span-4">
          <Card title="Household">
            <NumberRow
              label="Household size"
              value={household.household_size}
              min={1}
              max={8}
              step={1}
              onChange={(v) => setHousehold({ ...household, household_size: v })}
            />
            <NumberRow
              label="Oldest member age"
              value={household.oldest_member_age}
              min={0}
              max={100}
              step={1}
              onChange={(v) => setHousehold({ ...household, oldest_member_age: v })}
            />
            <NumberRow
              label="Monthly shelter costs ($)"
              value={household.monthly_shelter_costs}
              min={0}
              max={3000}
              step={50}
              onChange={(v) => setHousehold({ ...household, monthly_shelter_costs: v })}
            />
            <NumberRow
              label="Liquid resources ($)"
              value={household.liquid_resources}
              min={0}
              max={5000}
              step={100}
              onChange={(v) => setHousehold({ ...household, liquid_resources: v })}
            />
            <CheckRow
              label="Pays separate heating/cooling"
              checked={household.pays_separate_heating_or_cooling}
              onChange={(v) =>
                setHousehold({ ...household, pays_separate_heating_or_cooling: v })
              }
            />
            <CheckRow
              label="Any elderly or disabled member"
              checked={household.any_member_elderly_or_disabled}
              onChange={(v) =>
                setHousehold({ ...household, any_member_elderly_or_disabled: v })
              }
            />
          </Card>

          <Card title="Sweep range">
            <NumberRow
              label="Earnings max ($/mo)"
              value={earningsMax}
              min={1000}
              max={10000}
              step={500}
              onChange={setEarningsMax}
            />
            <NumberRow
              label="Step ($)"
              value={step}
              min={25}
              max={500}
              step={25}
              onChange={setStep}
            />
          </Card>

          <Card title="Reform parameters">
            <p className="-mt-2 mb-4 text-xs leading-relaxed text-ink-secondary">
              <span className="font-mono text-accent">1.00×</span> is current
              law. Drag to scale baseline values; the engine recompiles in&nbsp;~70&thinsp;ms.
            </p>
            <div className="space-y-4">
              {(["income-limits", "max-allotment", "deductions", "bbce"] as const).map(
                (group) => (
                  <div key={group}>
                    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
                      § {group.replace(/-/g, " ")}
                    </div>
                    {LEVERS.filter((l) => l.group === group).map((lever) => (
                      <LeverRow
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
                ),
              )}
            </div>
            <button
              className="mt-6 w-full border border-rule-strong px-3 py-2 text-sm font-medium uppercase tracking-wider text-ink-secondary transition-colors hover:border-accent hover:bg-accent-light hover:text-accent"
              onClick={() => setReformMultipliers(DEFAULT_MULTIPLIERS())}
            >
              Reset to current law
            </button>
          </Card>
        </aside>

        <section className="col-span-12 space-y-6 md:col-span-8">
          <Summary baseline={baseline} reform={reform} reformDirty={reformDirty} />

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
    <section className="border border-rule bg-paper-elevated p-5">
      {eyebrow && (
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
          {eyebrow}
        </div>
      )}
      <h2 className="mb-4 border-b border-rule pb-3 text-base font-bold tracking-[-0.02em] text-ink">
        {title}
      </h2>
      {children}
    </section>
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
      <div style={{ width: "100%", height: 260 }}>
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
            {reformDirty && (
              <Area
                type="monotone"
                dataKey={reformKey as string}
                stroke="none"
                fill="url(#delta-fill)"
                isAnimationActive={false}
                activeDot={false}
                legendType="none"
              />
            )}
            <Line
              type="monotone"
              dataKey={baselineKey as string}
              name="Baseline"
              stroke={INK}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            {reformDirty && (
              <Line
                type="monotone"
                dataKey={reformKey as string}
                name="Reform"
                stroke={ACCENT}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
              />
            )}
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

function NumberRow({
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
    <label className="mb-3 flex items-center justify-between gap-3 text-sm last:mb-0">
      <span className="flex-1 text-ink-secondary">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 px-2 py-1 text-right font-mono text-sm"
      />
    </label>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-3 flex items-center justify-between gap-3 text-sm last:mb-0">
      <span className="flex-1 text-ink-secondary">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}

function LeverRow({
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
    <div className="mb-4 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span
          className={`font-mono text-xs ${dirty ? "text-accent" : "text-ink-muted"}`}
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
      />
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
        baseline · {baseline}
      </div>
    </div>
  );
}

function Summary({
  baseline,
  reform,
  reformDirty,
}: {
  baseline: SweepResult | null;
  reform: SweepResult | null;
  reformDirty: boolean;
}) {
  if (!baseline) return null;
  const b = baseline.summary;
  const r = reform?.summary;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat
        label="Cliffs (MTR ≥ 100%)"
        baseline={b.cliff_count.toString()}
        reform={reformDirty && r ? r.cliff_count.toString() : null}
      />
      <Stat
        label="Max MTR"
        baseline={`${(b.max_mtr * 100).toFixed(0)}%`}
        reform={reformDirty && r ? `${(r.max_mtr * 100).toFixed(0)}%` : null}
      />
      <Stat
        label="Cliff share"
        baseline={`${(b.cliff_share * 100).toFixed(0)}%`}
        reform={reformDirty && r ? `${(r.cliff_share * 100).toFixed(0)}%` : null}
      />
      <Stat
        label="SNAP at $0 earnings"
        baseline={`$${b.total_snap_at_zero_earnings}`}
        reform={reformDirty && r ? `$${r.total_snap_at_zero_earnings}` : null}
      />
    </div>
  );
}

function Stat({
  label,
  baseline,
  reform,
}: {
  label: string;
  baseline: string;
  reform: string | null;
}) {
  return (
    <div className="border border-rule bg-paper-elevated p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </div>
      <div className="mt-2 font-mono text-3xl tracking-tight text-ink">{baseline}</div>
      {reform !== null && (
        <div className="mt-1 font-mono text-sm text-accent">→ {reform}</div>
      )}
    </div>
  );
}
