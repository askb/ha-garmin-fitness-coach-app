"use client";

/**
 * Debug / Data Consistency Page
 *
 * Surfaces drift between different sources of truth for the same metric.
 * This is the foundation for Phase 2 of the UX consistency overhaul
 * (see issue #87 in this repo).
 *
 * What it checks (so far):
 *   1. ACWR drift — live compute (analytics.getTrainingLoads) vs.
 *      cached daily snapshot (advancedMetrics.list latest).
 *   2. CTL / ATL drift — same two sources.
 *
 * Why this matters: the fitness dashboard ACWR gauge reads from one
 * source, while the chart and proactive insights read from another.
 * They can — and do — disagree. Anything > 0.05 absolute delta is
 * suspicious.
 */

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";

interface PmcEntry {
  date: string;
  ctl?: number | null;
  atl?: number | null;
  tsb?: number | null;
  acwr?: number | null;
}

function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

function delta(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

function statusBadge(d: number | null, tolerance: number): React.ReactNode {
  if (d == null) {
    return (
      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
        ⚪ N/A
      </span>
    );
  }
  const abs = Math.abs(d);
  if (abs <= tolerance) {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        🟢 OK ({d >= 0 ? "+" : ""}
        {d.toFixed(3)})
      </span>
    );
  }
  if (abs <= tolerance * 3) {
    return (
      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
        🟡 Drift ({d >= 0 ? "+" : ""}
        {d.toFixed(3)})
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      🔴 Mismatch ({d >= 0 ? "+" : ""}
      {d.toFixed(3)})
    </span>
  );
}

export default function DebugPage() {
  const trpc = useTRPC();

  const loads = useQuery(trpc.analytics.getTrainingLoads.queryOptions());
  // @ts-ignore — route added by gc-backend branch
  const pmc = useQuery(trpc.advancedMetrics.list.queryOptions({ days: 1 }));

  const liveAcwr = loads.data?.acwr ?? null;
  const liveCtl = loads.data?.ctl ?? null;
  const liveAtl = loads.data?.atl ?? null;

  const cachedLatest = ((pmc.data ?? []) as PmcEntry[])[0] ?? null;
  const cachedAcwr = cachedLatest?.acwr ?? null;
  const cachedCtl = cachedLatest?.ctl ?? null;
  const cachedAtl = cachedLatest?.atl ?? null;

  const acwrDelta = delta(liveAcwr, cachedAcwr);
  const ctlDelta = delta(liveCtl, cachedCtl);
  const atlDelta = delta(liveAtl, cachedAtl);

  const isLoading = loads.isLoading || pmc.isLoading;
  const error = loads.error ?? pmc.error;

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 pt-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold">🔧 Debug — Data Consistency</h1>
        <p className="mt-1 text-sm text-gray-500">
          Side-by-side comparison of the same metric from different sources.
          Anything other than 🟢 means the dashboard cards may disagree.
        </p>
      </div>

      {isLoading && (
        <div className="rounded-lg border p-4 text-sm text-gray-500">
          Loading…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Error loading data: {error.message}
        </div>
      )}

      {!isLoading && !error && (
        <>
          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-semibold">
              ACWR (Acute:Chronic Workload Ratio)
            </h2>
            <p className="mb-3 text-xs text-gray-500">
              Tolerance: ±0.05. Larger drift = gauge and chart will disagree.
            </p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-1">Source</th>
                  <th className="py-1">Endpoint</th>
                  <th className="py-1 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="py-1">Live compute</td>
                  <td className="py-1 font-mono text-xs">
                    analytics.getTrainingLoads
                  </td>
                  <td className="py-1 text-right font-mono">{fmt(liveAcwr)}</td>
                </tr>
                <tr className="border-t">
                  <td className="py-1">Cached (latest day)</td>
                  <td className="py-1 font-mono text-xs">
                    advancedMetrics.list[0]
                  </td>
                  <td className="py-1 text-right font-mono">
                    {fmt(cachedAcwr)}
                  </td>
                </tr>
                <tr className="border-t bg-gray-50">
                  <td className="py-1 font-semibold">Delta</td>
                  <td className="py-1"></td>
                  <td className="py-1 text-right">
                    {statusBadge(acwrDelta, 0.05)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-semibold">
              CTL (Chronic Training Load)
            </h2>
            <p className="mb-3 text-xs text-gray-500">
              Tolerance: ±1.0 TSS-equivalent units.
            </p>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-t">
                  <td className="py-1">Live compute</td>
                  <td className="py-1 text-right font-mono">
                    {fmt(liveCtl, 1)}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="py-1">Cached (latest day)</td>
                  <td className="py-1 text-right font-mono">
                    {fmt(cachedCtl, 1)}
                  </td>
                </tr>
                <tr className="border-t bg-gray-50">
                  <td className="py-1 font-semibold">Delta</td>
                  <td className="py-1 text-right">
                    {statusBadge(ctlDelta, 1.0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-semibold">ATL (Acute Training Load)</h2>
            <p className="mb-3 text-xs text-gray-500">
              Tolerance: ±1.0 TSS-equivalent units.
            </p>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-t">
                  <td className="py-1">Live compute</td>
                  <td className="py-1 text-right font-mono">
                    {fmt(liveAtl, 1)}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="py-1">Cached (latest day)</td>
                  <td className="py-1 text-right font-mono">
                    {fmt(cachedAtl, 1)}
                  </td>
                </tr>
                <tr className="border-t bg-gray-50">
                  <td className="py-1 font-semibold">Delta</td>
                  <td className="py-1 text-right">
                    {statusBadge(atlDelta, 1.0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border bg-blue-50 p-4 text-sm">
            <h2 className="mb-2 font-semibold">📖 How to interpret</h2>
            <ul className="list-inside list-disc space-y-1 text-gray-700">
              <li>
                <strong>🟢 OK</strong> — sources agree within tolerance,
                dashboard should be consistent.
              </li>
              <li>
                <strong>🟡 Drift</strong> — small mismatch (likely rounding /
                async snapshot timing). Usually safe but worth tracking.
              </li>
              <li>
                <strong>🔴 Mismatch</strong> — significant disagreement. The
                fitness page gauge and chart will visibly disagree. Investigate
                cache staleness or compute differences.
              </li>
            </ul>
            <p className="mt-2 text-xs text-gray-500">
              Related: see issues #86 (audit), #87 (validation tooling), and #88
              (refactor) in this repo.
            </p>
          </section>
        </>
      )}

      <BottomNav />
    </main>
  );
}
