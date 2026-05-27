// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";

import { useUserTimezone } from "~/lib/format-date";
import { useTRPC } from "~/trpc/react";

type TrendPayload = RouterOutputs["coach"]["adherenceTrend"];
type TrendPoint = TrendPayload["points"][number];
type TrendStatus = TrendPoint["status"] | "no-data";

type Cell = {
  date: string;
  point: TrendPoint | null;
};

const WINDOWS = [7, 14, 28] as const;
type WindowDays = (typeof WINDOWS)[number];

const POSITIVE_STATUSES = new Set<TrendStatus>([
  "completed",
  "partial",
  "extra",
]);

const NEGATIVE_STATUSES = new Set<TrendStatus>(["missed"]);

const STATUS_LABEL: Record<TrendStatus, string> = {
  completed: "Completed",
  partial: "Partial",
  extra: "Extra",
  missed: "Missed",
  "no-plan": "No plan",
  "no-data": "No data",
};

const STATUS_STYLE: Record<TrendStatus, string> = {
  completed: "bg-green-500",
  partial: "bg-green-500",
  extra: "bg-green-500",
  missed: "bg-red-500",
  "no-plan": "bg-gray-400 dark:bg-gray-500",
  "no-data": "bg-gray-200 dark:bg-gray-700",
};

function isoDayInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : date.toISOString().slice(0, 10);
}

function shiftIsoDay(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function normalizePayload(data: TrendPayload | TrendPoint[] | undefined) {
  return Array.isArray(data) ? data : (data?.points ?? []);
}

function statusPriority(status: TrendPoint["status"]): number {
  if (status === "missed") return 3;
  if (POSITIVE_STATUSES.has(status)) return 2;
  return 1;
}

function selectDailyPoint(
  current: TrendPoint | undefined,
  candidate: TrendPoint,
): TrendPoint {
  if (!current) return candidate;

  const currentPriority = statusPriority(current.status);
  const candidatePriority = statusPriority(candidate.status);
  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority ? candidate : current;
  }

  return candidate.status.localeCompare(current.status) > 0
    ? candidate
    : current;
}

function buildCells(
  points: TrendPoint[],
  days: WindowDays,
  timezone: string,
): Cell[] {
  const pointsByDate = points.reduce<Map<string, TrendPoint>>((map, point) => {
    map.set(point.date, selectDailyPoint(map.get(point.date), point));
    return map;
  }, new Map());
  const endDate = isoDayInTimezone(new Date(), timezone);
  const startDate = shiftIsoDay(endDate, -(days - 1));

  return Array.from({ length: days }, (_, index) => {
    const date = shiftIsoDay(startDate, index);
    return { date, point: pointsByDate.get(date) ?? null };
  });
}

function adherenceRate(points: TrendPoint[]): number {
  const positive = points.filter((point) =>
    POSITIVE_STATUSES.has(point.status),
  ).length;
  const negative = points.filter((point) =>
    NEGATIVE_STATUSES.has(point.status),
  ).length;
  const denominator = positive + negative;

  if (denominator === 0) return 0;
  return Math.round((positive / denominator) * 100);
}

function currentStreak(points: TrendPoint[]): number {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]!;
    if (POSITIVE_STATUSES.has(point.status)) {
      streak += 1;
      continue;
    }
    if (NEGATIVE_STATUSES.has(point.status)) break;
  }

  return streak;
}

function formatDeviation(point: TrendPoint | null): string {
  if (!point) return "No adherence data recorded";

  const planned = point.plannedDurationMin;
  const actual = point.actualDurationMin;
  if (planned == null) {
    return actual > 0 ? `Actual ${actual} min` : "No planned workout";
  }

  const delta = actual - planned;
  const deltaLabel =
    delta === 0 ? "on target" : `${delta > 0 ? "+" : ""}${delta} min`;
  return `Planned ${planned} min, actual ${actual} min (${deltaLabel})`;
}

function cellLabel(cell: Cell): string {
  const status = cell.point?.status ?? "no-data";
  return `${cell.date}: ${STATUS_LABEL[status]}. ${formatDeviation(cell.point)}`;
}

function AdherenceSkeleton({ days }: { days: WindowDays }) {
  return (
    <section
      aria-busy="true"
      aria-label="Loading adherence trend"
      className="bg-card animate-pulse rounded-2xl border p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="bg-muted h-6 w-40 rounded-full" />
        <div className="bg-muted h-8 w-36 rounded-full" />
      </div>
      <div className="bg-muted mt-5 h-10 w-24 rounded" />
      <div className="bg-muted mt-2 h-4 w-32 rounded" />
      <div className="mt-5 flex gap-1">
        {Array.from({ length: days }, (_, index) => (
          <div key={index} className="bg-muted h-8 flex-1 rounded" />
        ))}
      </div>
    </section>
  );
}

export function AdherenceTrendCard({ userId }: { userId: string }) {
  const trpc = useTRPC();
  const timezone = useUserTimezone();
  const [days, setDays] = useState<WindowDays>(14);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const query = useQuery(
    trpc.coach.adherenceTrend.queryOptions({ userId, days }),
  );

  const points = useMemo(
    () =>
      normalizePayload(query.data as TrendPayload | TrendPoint[] | undefined),
    [query.data],
  );
  const cells = useMemo(
    () => buildCells(points, days, timezone),
    [days, points, timezone],
  );
  const selectedCell =
    cells.find((cell) => cell.date === selectedDate) ?? cells.at(-1) ?? null;
  const rate = adherenceRate(points);
  const streak = currentStreak(points);

  if (query.isLoading) return <AdherenceSkeleton days={days} />;

  if (query.isError) {
    return (
      <section className="bg-card rounded-2xl border p-5 text-center">
        <h2 className="text-lg font-semibold">Adherence trend unavailable</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          PulseCoach could not load your adherence trend. Please try again.
        </p>
        <Button
          className="mt-4 w-full sm:w-auto"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </section>
    );
  }

  return (
    <section className="bg-card rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">
            Adherence trend
          </p>
          <h2 className="mt-1 text-xl font-semibold">Training consistency</h2>
        </div>
        <div
          className="bg-muted inline-flex w-fit rounded-full p-1"
          aria-label="Adherence window"
        >
          {WINDOWS.map((windowDays) => (
            <Button
              key={windowDays}
              type="button"
              size="sm"
              variant={days === windowDays ? "default" : "ghost"}
              className="h-7 rounded-full px-3 text-xs"
              aria-pressed={days === windowDays}
              onClick={() => setDays(windowDays)}
            >
              {windowDays}d
            </Button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <p className="text-muted-foreground mt-5 rounded-xl border border-dashed p-4 text-sm">
          Start your first session to begin tracking adherence.
        </p>
      ) : (
        <>
          <div className="mt-5 flex items-end gap-3">
            <div
              className="text-4xl font-bold tabular-nums"
              aria-label={`Adherence rate ${rate} percent`}
            >
              {rate}%
            </div>
            <p className="text-muted-foreground pb-1 text-sm">
              adherence rate · {streak} day{streak === 1 ? "" : "s"} current
              streak
            </p>
          </div>

          <div
            className="mt-5 flex gap-1"
            aria-label={`${days} day adherence strip`}
          >
            {cells.map((cell) => {
              const status = cell.point?.status ?? "no-data";
              return (
                <button
                  key={cell.date}
                  type="button"
                  className={cn(
                    "focus-visible:ring-ring h-9 min-w-0 flex-1 rounded-sm transition-transform hover:scale-y-110 focus-visible:ring-2 focus-visible:outline-none",
                    selectedCell?.date === cell.date
                      ? "ring-ring ring-2"
                      : null,
                    STATUS_STYLE[status],
                  )}
                  title={cellLabel(cell)}
                  aria-label={cellLabel(cell)}
                  aria-pressed={selectedCell?.date === cell.date}
                  onClick={() => setSelectedDate(cell.date)}
                  onFocus={() => setSelectedDate(cell.date)}
                  onMouseEnter={() => setSelectedDate(cell.date)}
                />
              );
            })}
          </div>

          {selectedCell ? (
            <p className="bg-popover text-popover-foreground mt-3 rounded-lg border px-3 py-2 text-xs shadow-sm">
              {cellLabel(selectedCell)}
            </p>
          ) : null}

          <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-500" />
              Positive
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500" />
              Missed
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-gray-400" />
              No plan
            </span>
            <span>
              <span className="bg-muted mr-1 inline-block h-2 w-2 rounded-sm" />
              No data
            </span>
          </div>
        </>
      )}
    </section>
  );
}
