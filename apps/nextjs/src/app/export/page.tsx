"use client";

// Data Export & Portability
import { useQuery } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";

/* ─────────────── helpers ─────────────── */

function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) {
    toast.error("No data to export");
    return;
  }
  const headers = Object.keys(data[0]!);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        const str = val == null ? "" : String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv" }), filename);
}

function exportToJSON(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  triggerDownload(new Blob([json], { type: "application/json" }), filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDateForFilename() {
  return new Date().toISOString().slice(0, 10);
}

/* ─────────────── page ─────────────── */

export default function ExportPage() {
  const trpc = useTRPC();

  // Data queries
  const activities = useQuery(trpc.activity.list.queryOptions({ days: 365 }));
  const trendsSummary = useQuery(
    trpc.trends.getSummary.queryOptions({ period: "28d" }),
  );
  const journalQuery = useQuery(
    trpc.journal.list.queryOptions({
      startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    }),
  );

  /* ── Data summary counts ── */
  const activityCount = activities.data?.length ?? 0;
  const journalCount = journalQuery.data?.length ?? 0;

  const earliestDate = activities.data?.length
    ? [...(activities.data as Array<{ startedAt?: Date | string | null }>)]
        .filter((a) => a.startedAt != null)
        .sort(
          (a, b) =>
            new Date(a.startedAt as string).getTime() -
            new Date(b.startedAt as string).getTime(),
        )[0]?.startedAt
    : null;

  /* ── Export handlers ── */
  function handleExportActivities() {
    if (!activities.data) return toast.error("Activities data not loaded");
    exportToCSV(
      activities.data as Record<string, unknown>[],
      `garmincoach-activities-${formatDateForFilename()}.csv`,
    );
  }

  function handleExportMetrics() {
    const summary = trendsSummary.data;
    if (!summary) return toast.error("Metrics data not loaded");
    const rows = [summary as Record<string, unknown>];
    exportToCSV(rows, `garmincoach-metrics-${formatDateForFilename()}.csv`);
  }

  function handleExportJournal() {
    if (!journalQuery.data) return toast.error("Journal data not loaded");
    exportToCSV(
      journalQuery.data as Record<string, unknown>[],
      `garmincoach-journal-${formatDateForFilename()}.csv`,
    );
  }

  function handleFullExport() {
    const payload = {
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      activities: activities.data ?? [],
      metrics: trendsSummary.data ?? {},
      journal: journalQuery.data ?? [],
    };
    exportToJSON(payload, `garmincoach-backup-${formatDateForFilename()}.json`);
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-24">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold">Data Export</h1>
        <p className="text-muted-foreground text-sm">
          Download your training data · Import backups
        </p>
      </div>

      {/* ── Data Summary ── */}
      <div className="bg-card rounded-2xl border p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wider uppercase">
          Your Data
        </h2>
        {activities.isLoading ? (
          <div className="bg-muted h-12 animate-pulse rounded-lg" />
        ) : (
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
            <div className="bg-secondary/40 rounded-xl p-3">
              <p className="text-xl font-bold">{activityCount}</p>
              <p className="text-muted-foreground text-xs">Activities</p>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3">
              <p className="text-xl font-bold">{journalCount}</p>
              <p className="text-muted-foreground text-xs">Journal entries</p>
            </div>
            <div className="bg-secondary/40 col-span-2 rounded-xl p-3 sm:col-span-1">
              <p className="truncate text-sm font-bold">
                {earliestDate
                  ? new Date(earliestDate as string).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        year: "numeric",
                      },
                    )
                  : "—"}
              </p>
              <p className="text-muted-foreground text-xs">Earliest data</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Export Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="bg-card space-y-3 rounded-2xl border p-4">
          <div>
            <p className="font-semibold">Daily Metrics</p>
            <p className="text-muted-foreground mt-0.5 text-xs">CSV export</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={trendsSummary.isLoading}
            onClick={handleExportMetrics}
          >
            Download CSV
          </Button>
        </div>

        <div className="bg-card space-y-3 rounded-2xl border p-4">
          <div>
            <p className="font-semibold">Activities</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {activityCount} records · CSV
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={activities.isLoading}
            onClick={handleExportActivities}
          >
            Download CSV
          </Button>
        </div>

        <div className="bg-card space-y-3 rounded-2xl border p-4">
          <div>
            <p className="font-semibold">Journal</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {journalCount} entries · CSV
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={journalQuery.isLoading}
            onClick={handleExportJournal}
          >
            Download CSV
          </Button>
        </div>
      </div>

      {/* ── Full JSON Backup ── */}
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <div>
          <h2 className="font-semibold">Full Data Export (JSON)</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Activities + journal + metrics in a single backup file with schema
            version and timestamp.
          </p>
        </div>
        <Button
          className="w-full"
          disabled={activities.isLoading || journalQuery.isLoading}
          onClick={handleFullExport}
        >
          Download JSON Backup
        </Button>
      </div>

      {/* ── Import (Coming Soon) ── */}
      <div className="bg-card space-y-3 rounded-2xl border p-4 opacity-75">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Import from File</h2>
          <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-600 dark:text-yellow-400">
            Coming Soon
          </span>
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Import coming in a future update. You&apos;ll be able to restore JSON
          backups exported from this app.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
