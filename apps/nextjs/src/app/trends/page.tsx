"use client";

import { useState } from "react";
import Link from "next/link";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { BottomNav } from "../_components/bottom-nav";

type Period = "7d" | "28d";

export default function TrendsPage() {
  const [period, setPeriod] = useState<Period>("7d");
  const trpc = useTRPC();

  const summary = useQuery(trpc.trends.getSummary.queryOptions({ period }));
  const readinessChart = useQuery(
    trpc.trends.getChart.queryOptions({
      metric: "readiness",
      days: period === "7d" ? 7 : 28,
    }),
  );
  const sleepChart = useQuery(
    trpc.trends.getChart.queryOptions({
      metric: "sleep",
      days: period === "7d" ? 7 : 28,
    }),
  );
  const hrvChart = useQuery(
    trpc.trends.getChart.queryOptions({
      metric: "hrv",
      days: period === "7d" ? 7 : 28,
    }),
  );

  const s = summary.data;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trends</h1>
        <div className="bg-muted flex gap-1 rounded-lg p-0.5">
          {(["7d", "28d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                period === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "7d" ? "7 Days" : "28 Days"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      {s && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold">{s.avgReadiness ?? "—"}</p>
            <p className="text-muted-foreground text-xs">Avg Readiness</p>
          </div>
          <div className="bg-card rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold">
              {s.avgSleepMinutes
                ? `${(s.avgSleepMinutes / 60).toFixed(1)}h`
                : "—"}
            </p>
            <p className="text-muted-foreground text-xs">Avg Sleep</p>
          </div>
          <div className="bg-card rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold">
              {s.avgHrv ? `${s.avgHrv}` : "—"}
            </p>
            <p className="text-muted-foreground text-xs">Avg HRV (ms)</p>
          </div>
        </div>
      )}

      {/* Readiness Chart */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Readiness Score
        </h2>
        <MiniBarChart
          data={
            (readinessChart.data ?? []) as {
              date: string;
              value: number | null;
            }[]
          }
          maxValue={100}
          colorFn={(v) =>
            v >= 80
              ? "bg-green-500"
              : v >= 60
                ? "bg-teal-500"
                : v >= 40
                  ? "bg-yellow-500"
                  : v >= 20
                    ? "bg-orange-500"
                    : "bg-red-500"
          }
        />
      </div>

      {/* Sleep Chart */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Sleep (minutes)
        </h2>
        <MiniBarChart
          data={
            (sleepChart.data ?? []) as { date: string; value: number | null }[]
          }
          maxValue={540}
          colorFn={() => "bg-blue-500"}
        />
      </div>

      {/* HRV Chart */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          HRV (ms)
        </h2>
        <MiniBarChart
          data={
            (hrvChart.data ?? []) as { date: string; value: number | null }[]
          }
          maxValue={80}
          colorFn={() => "bg-purple-500"}
        />
      </div>

      <BottomNav />
    </main>
  );
}

function MiniBarChart({
  data,
  maxValue,
  colorFn,
}: {
  data: { date: string; value: number | null }[];
  maxValue: number;
  colorFn: (value: number) => string;
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No data yet
      </p>
    );
  }

  return (
    <div className="flex items-end gap-1" style={{ height: 80 }}>
      {data.map((d, i) => {
        const v = d.value ?? 0;
        const height = Math.max(2, (v / maxValue) * 100);
        return (
          <div
            key={i}
            className="group relative flex-1"
            title={`${d.date}: ${v}`}
          >
            <div
              className={cn("w-full rounded-t-sm transition-all", colorFn(v))}
              style={{ height: `${height}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
