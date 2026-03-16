"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";
import { SectionHeader } from "../_components/info-button";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Period = "30d" | "90d" | "180d";

const PERIODS: { value: Period; label: string }[] = [
  { value: "30d", label: "30 D" },
  { value: "90d", label: "90 D" },
  { value: "180d", label: "180 D" },
];

const METRICS = [
  "sleep",
  "hrv",
  "restingHr",
  "stress",
  "strain",
  "readiness",
] as const;

type Metric = (typeof METRICS)[number];

const METRIC_LABELS: Record<string, string> = {
  sleep: "Sleep",
  hrv: "HRV",
  restingHr: "Resting HR",
  stress: "Stress",
  strain: "Strain",
  readiness: "Readiness",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rValueColor(r: number): string {
  const abs = Math.abs(r);
  if (r > 0) {
    if (abs >= 0.7) return "bg-green-600 text-white";
    if (abs >= 0.4) return "bg-green-500/40 text-green-200";
    return "bg-green-500/15 text-green-300";
  }
  if (r < 0) {
    if (abs >= 0.7) return "bg-red-600 text-white";
    if (abs >= 0.4) return "bg-red-500/40 text-red-200";
    return "bg-red-500/15 text-red-300";
  }
  return "bg-zinc-800 text-zinc-400";
}

function rValueBorder(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return r > 0 ? "border-green-500/60" : "border-red-500/60";
  if (abs >= 0.4)
    return r > 0 ? "border-green-500/30" : "border-red-500/30";
  return "border-zinc-700/50";
}

function strengthBadge(
  strength: string,
): { bg: string; text: string } {
  if (strength === "strong")
    return { bg: "bg-green-500/20", text: "text-green-400" };
  if (strength === "moderate")
    return { bg: "bg-yellow-500/20", text: "text-yellow-400" };
  return { bg: "bg-zinc-700/50", text: "text-zinc-400" };
}

function insightSentiment(
  direction: string,
  metricA: string,
  metricB: string,
): "beneficial" | "detrimental" | "neutral" {
  // Positive correlations with recovery metrics are generally beneficial
  const recoveryMetrics = ["readiness", "hrv", "sleep"];
  const stressMetrics = ["stress", "strain", "restingHr"];

  const aIsRecovery = recoveryMetrics.includes(metricA);
  const bIsRecovery = recoveryMetrics.includes(metricB);
  const aIsStress = stressMetrics.includes(metricA);
  const bIsStress = stressMetrics.includes(metricB);

  if (direction === "positive") {
    if ((aIsRecovery && bIsRecovery) || (aIsStress && bIsStress))
      return "neutral";
    if (aIsRecovery && bIsStress) return "detrimental";
    return "beneficial";
  }
  if (direction === "negative") {
    if (
      (aIsRecovery && bIsStress) ||
      (aIsStress && bIsRecovery)
    )
      return "beneficial";
    if (aIsRecovery && bIsRecovery) return "detrimental";
    return "neutral";
  }
  return "neutral";
}

function sentimentColor(s: "beneficial" | "detrimental" | "neutral"): string {
  if (s === "beneficial") return "border-green-500/40 bg-green-500/5";
  if (s === "detrimental") return "border-red-500/40 bg-red-500/5";
  return "border-zinc-700 bg-zinc-800/30";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CorrelationsPage() {
  const trpc = useTRPC();
  const [period, setPeriod] = useState<Period>("90d");
  const [guideOpen, setGuideOpen] = useState(false);

  const correlationsQuery = useQuery(
    trpc.analytics.getCorrelations.queryOptions({ period }),
  );

  const pairs = correlationsQuery.data ?? [];

  // Build matrix lookup: key = "metricA|metricB" => rValue
  const matrixLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pairs) {
      map.set(`${p.metricA}|${p.metricB}`, p.rValue);
      map.set(`${p.metricB}|${p.metricA}`, p.rValue);
    }
    return map;
  }, [pairs]);

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 pb-24 pt-6">
      {/* ---- Header ---- */}
      <div>
        <h1 className="text-xl font-bold">Correlation Insights</h1>
        <p className="text-muted-foreground text-sm">
          How your metrics relate to each other
        </p>
      </div>

      {/* ---- Period Selector ---- */}
      <div className="bg-card inline-flex rounded-xl border p-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              period === p.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ---- Correlation Heatmap ---- */}
      <div>
        <SectionHeader
          title="Correlation Matrix"
          info="A heatmap showing Pearson correlation coefficients between all your health metrics. Blue = positive correlation (metrics rise together), red = negative (one rises as the other falls). Values range from -1.0 to +1.0. Focus on strong correlations (|r| > 0.5) for actionable insights."
          className="mb-3"
        />

        {correlationsQuery.isLoading ? (
          <div className="bg-card h-64 animate-pulse rounded-2xl border" />
        ) : pairs.length === 0 ? (
          <div className="bg-card rounded-2xl border p-6 text-center">
            <p className="text-muted-foreground text-sm">
              Not enough data for the selected period. Try a longer window.
            </p>
          </div>
        ) : (
          <div className="bg-card overflow-x-auto rounded-2xl border p-3">
            <div
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `4.5rem repeat(${METRICS.length}, 1fr)`,
              }}
            >
              {/* Header row */}
              <div />
              {METRICS.map((m) => (
                <div
                  key={m}
                  className="text-muted-foreground py-1 text-center text-[10px] font-semibold uppercase"
                >
                  {METRIC_LABELS[m]}
                </div>
              ))}

              {/* Data rows */}
              {METRICS.map((row) => (
                <>
                  <div
                    key={`label-${row}`}
                    className="text-muted-foreground flex items-center text-[10px] font-semibold uppercase"
                  >
                    {METRIC_LABELS[row]}
                  </div>
                  {METRICS.map((col) => {
                    if (row === col) {
                      return (
                        <div
                          key={`${row}-${col}`}
                          className="flex aspect-square items-center justify-center rounded-md bg-zinc-700/30 text-[10px] text-zinc-500"
                        >
                          1.00
                        </div>
                      );
                    }
                    const r = matrixLookup.get(`${row}|${col}`);
                    if (r === undefined) {
                      return (
                        <div
                          key={`${row}-${col}`}
                          className="flex aspect-square items-center justify-center rounded-md bg-zinc-800/50 text-[10px] text-zinc-600"
                        >
                          —
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`${row}-${col}`}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-md border text-[11px] font-medium transition-all",
                          rValueColor(r),
                          rValueBorder(r),
                        )}
                        title={`${METRIC_LABELS[row]} ↔ ${METRIC_LABELS[col]}: r=${r.toFixed(3)}`}
                      >
                        {r.toFixed(2)}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center justify-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded bg-red-600" />
                Strong −
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded bg-red-500/40" />
                Moderate −
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded bg-zinc-700/50" />
                Weak
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded bg-green-500/40" />
                Moderate +
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded bg-green-600" />
                Strong +
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ---- Top Insights Cards ---- */}
      {pairs.length > 0 && (
        <div>
          <SectionHeader
            title="Key Insights"
            info="Auto-generated interpretations of the strongest correlations found in your data. Each insight explains what the relationship means for your health and training, with practical suggestions. Correlations don't prove causation, but consistent patterns across months are highly informative."
            className="mb-3"
          />

          <div className="space-y-3">
            {pairs.map((c, i) => {
              const badge = strengthBadge(c.strength);
              const sentiment = insightSentiment(
                c.direction,
                c.metricA,
                c.metricB,
              );

              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border p-4",
                    sentimentColor(sentiment),
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {METRIC_LABELS[c.metricA] ?? c.metricA}{" "}
                      <span className="text-muted-foreground">→</span>{" "}
                      {METRIC_LABELS[c.metricB] ?? c.metricB}
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        badge.bg,
                        badge.text,
                      )}
                    >
                      {c.strength}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">
                      r = <span className="font-mono">{c.rValue.toFixed(3)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      p = <span className="font-mono">{c.pValue.toFixed(4)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      n = {c.sampleSize}
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        c.direction === "positive"
                          ? "text-green-400"
                          : c.direction === "negative"
                            ? "text-red-400"
                            : "text-zinc-400",
                      )}
                    >
                      {c.direction === "positive"
                        ? "↑ Positive"
                        : c.direction === "negative"
                          ? "↓ Negative"
                          : "→ None"}
                    </span>
                  </div>

                  {c.insight && (
                    <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                      {c.insight}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Interpretation Guide ---- */}
      <div className="bg-card rounded-2xl border">
        <button
          onClick={() => setGuideOpen((o) => !o)}
          className="flex w-full items-center justify-between p-4"
        >
          <span className="text-sm font-medium">
            What do these numbers mean?
          </span>
          <span
            className={cn(
              "text-muted-foreground transition-transform",
              guideOpen && "rotate-180",
            )}
          >
            ▾
          </span>
        </button>

        {guideOpen && (
          <div className="space-y-3 border-t px-4 pb-4 pt-3 text-xs leading-relaxed">
            <div>
              <h3 className="mb-1 font-semibold">
                Correlation Coefficient (r)
              </h3>
              <p className="text-muted-foreground">
                Measures linear relationship between two metrics, from −1 to +1.
                Positive means they move together; negative means they move
                oppositely.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="font-semibold">Strength Guide</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-green-500/10 p-2 text-center">
                  <p className="font-mono text-green-400">|r| &gt; 0.7</p>
                  <p className="text-muted-foreground text-[10px]">Strong</p>
                </div>
                <div className="rounded-lg bg-yellow-500/10 p-2 text-center">
                  <p className="font-mono text-yellow-400">0.4 – 0.7</p>
                  <p className="text-muted-foreground text-[10px]">Moderate</p>
                </div>
                <div className="rounded-lg bg-zinc-700/30 p-2 text-center">
                  <p className="font-mono text-zinc-400">|r| &lt; 0.4</p>
                  <p className="text-muted-foreground text-[10px]">Weak</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">
                Statistical Significance (p-value)
              </h3>
              <p className="text-muted-foreground">
                A p-value below <span className="font-mono">0.05</span> means
                the correlation is statistically significant — unlikely to be
                due to chance. Lower is stronger evidence.
              </p>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Sample Size (n)</h3>
              <p className="text-muted-foreground">
                The number of days with data for both metrics. More data
                generally means more reliable correlations.
              </p>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
