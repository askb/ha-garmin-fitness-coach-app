"use client";

import { useMemo, useState } from "react";
import { IngressLink as Link } from "~/app/_components/ingress-link";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";

// ---------------------------------------------------------------------------
// Tag definitions
// ---------------------------------------------------------------------------

interface TagDef {
  key: string;
  emoji: string;
  label: string;
  type: "toggle" | "select";
  options?: string[];
}

const TAGS: TagDef[] = [
  { key: "alcohol", emoji: "🍺", label: "Alcohol", type: "toggle" },
  {
    key: "caffeine",
    emoji: "☕",
    label: "Caffeine",
    type: "select",
    options: ["1", "2", "3+"],
  },
  { key: "travel", emoji: "✈️", label: "Travel", type: "toggle" },
  {
    key: "stress",
    emoji: "😰",
    label: "Stress",
    type: "select",
    options: ["low", "med", "high"],
  },
  {
    key: "hydration",
    emoji: "💧",
    label: "Hydration",
    type: "select",
    options: ["poor", "ok", "good", "excellent"],
  },
  { key: "meditation", emoji: "🧘", label: "Meditation", type: "toggle" },
  { key: "illness", emoji: "🤒", label: "Illness", type: "toggle" },
  { key: "social", emoji: "🎉", label: "Social", type: "toggle" },
  { key: "supplements", emoji: "💊", label: "Supplements", type: "toggle" },
];

const TAG_COLORS: Record<string, string> = {
  alcohol: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  caffeine: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  travel: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  stress: "bg-red-500/20 text-red-400 border-red-500/30",
  hydration: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  meditation: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  illness: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  social: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  supplements: "bg-green-500/20 text-green-400 border-green-500/30",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { startDate: toDateStr(start), endDate: toDateStr(end) };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function JournalPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // -- Date selection --
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<Record<string, boolean | number | string>>(
    {},
  );
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // -- Queries --
  const range = useMemo(() => dateRange(14), []);

  const entryQuery = useQuery(
    trpc.journal.getByDate.queryOptions({ date: selectedDate }),
  );

  const historyQuery = useQuery(
    trpc.journal.list.queryOptions(range),
  );

  const correlationsQuery = useQuery(
    trpc.analytics.getCorrelations.queryOptions({ period: "30d" }),
  );

  // Sync form when entry data changes
  const loadedDate = entryQuery.data?.date;
  const [syncedDate, setSyncedDate] = useState<string | null>(null);
  if (loadedDate && loadedDate !== syncedDate) {
    const entry = entryQuery.data;
    setTags(
      (entry?.tags as Record<string, boolean | number | string>) ?? {},
    );
    setNotes((entry?.notes as string) ?? "");
    setSyncedDate(loadedDate);
  }
  // Clear form when switching to a date with no entry
  if (!entryQuery.isLoading && !entryQuery.data && syncedDate !== selectedDate) {
    if (syncedDate !== null || Object.keys(tags).length > 0 || notes !== "") {
      setTags({});
      setNotes("");
      setSyncedDate(selectedDate);
    }
  }

  // -- Mutations --
  const upsertMutation = useMutation(
    trpc.journal.upsert.mutationOptions({
      onSuccess: () => {
        toast.success("Entry saved");
        void queryClient.invalidateQueries(trpc.journal.pathFilter());
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  const deleteMutation = useMutation(
    trpc.journal.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Entry deleted");
        setDeleteConfirm(null);
        void queryClient.invalidateQueries(trpc.journal.pathFilter());
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  // -- Tag handlers --
  function toggleTag(key: string) {
    setTags((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
      return next;
    });
  }

  function cycleSelectTag(key: string, options: string[]) {
    setTags((prev) => {
      const next = { ...prev };
      const current = next[key] as string | undefined;
      if (!current) {
        next[key] = options[0]!;
      } else {
        const idx = options.indexOf(current);
        if (idx === options.length - 1) {
          delete next[key];
        } else {
          next[key] = options[idx + 1]!;
        }
      }
      return next;
    });
  }

  function handleSave() {
    upsertMutation.mutate({ date: selectedDate, tags, notes });
  }

  function loadEntry(date: string) {
    setSyncedDate(null);
    setSelectedDate(date);
  }

  // -- Navigate date --
  function shiftDate(dir: -1 | 1) {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + dir);
    const next = toDateStr(d);
    if (next > toDateStr(new Date())) return;
    setSyncedDate(null);
    setSelectedDate(next);
  }

  const topCorrelations = (correlationsQuery.data ?? []).slice(0, 3);

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 pb-24 pt-6">
      {/* ---- Header ---- */}
      <div>
        <h1 className="text-xl font-bold">Journal</h1>
        <p className="text-muted-foreground text-sm">
          Track factors that affect your performance
        </p>
      </div>

      {/* ---- Date Selector ---- */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => shiftDate(-1)}>
          ←
        </Button>
        <button
          className="text-sm font-medium"
          onClick={() => {
            setSyncedDate(null);
            setSelectedDate(toDateStr(new Date()));
          }}
        >
          {selectedDate === toDateStr(new Date())
            ? "Today"
            : fmtDate(selectedDate)}
        </button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => shiftDate(1)}
          disabled={selectedDate === toDateStr(new Date())}
        >
          →
        </Button>
      </div>

      {/* ---- Entry Form ---- */}
      <div className="bg-card space-y-4 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Tags
        </h2>

        <div className="grid grid-cols-3 gap-2">
          {TAGS.map((tag) => {
            const active = tags[tag.key] !== undefined;
            const value = tags[tag.key];

            return (
              <button
                key={tag.key}
                onClick={() =>
                  tag.type === "toggle"
                    ? toggleTag(tag.key)
                    : cycleSelectTag(tag.key, tag.options!)
                }
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs transition-all",
                  active
                    ? TAG_COLORS[tag.key]
                    : "border-transparent bg-secondary/50 text-muted-foreground hover:bg-secondary",
                )}
              >
                <span className="text-base">{tag.emoji}</span>
                <span className="font-medium">{tag.label}</span>
                {active && typeof value === "string" && (
                  <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
                    {value}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Notes
          </h2>
          <textarea
            className="bg-secondary/50 border-border w-full rounded-xl border p-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/40"
            rows={3}
            placeholder="How are you feeling today?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={upsertMutation.isPending}
        >
          {upsertMutation.isPending ? "Saving…" : "Save Entry"}
        </Button>
      </div>

      {/* ---- Journal History ---- */}
      <div>
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
          Recent Entries
        </h2>

        {historyQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card h-16 animate-pulse rounded-xl border"
              />
            ))}
          </div>
        ) : !historyQuery.data?.length ? (
          <div className="bg-card rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">
              No entries yet. Start journaling above!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {historyQuery.data.map((entry) => {
              const entryTags = (entry.tags ?? {}) as Record<
                string,
                boolean | number | string
              >;
              const activeTagKeys = Object.keys(entryTags);
              const isActive = entry.date === selectedDate;

              return (
                <button
                  key={entry.date}
                  onClick={() => loadEntry(entry.date)}
                  className={cn(
                    "bg-card w-full rounded-xl border p-3 text-left transition-all",
                    isActive && "ring-primary/50 ring-2",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {fmtDate(entry.date)}
                      </p>

                      {activeTagKeys.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {activeTagKeys.map((key) => {
                            const tagDef = TAGS.find((t) => t.key === key);
                            if (!tagDef) return null;
                            const val = entryTags[key];
                            return (
                              <span
                                key={key}
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                  TAG_COLORS[key] ??
                                    "bg-zinc-700/50 text-zinc-400",
                                )}
                              >
                                {tagDef.emoji}{" "}
                                {typeof val === "string" ? val : tagDef.label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {entry.notes && (
                        <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                          {entry.notes as string}
                        </p>
                      )}
                    </div>

                    {/* Delete */}
                    <div className="flex-shrink-0">
                      {deleteConfirm === entry.date ? (
                        <div className="flex gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate({ date: entry.date });
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(null);
                            }}
                          >
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground h-7 px-2 text-xs hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(entry.date);
                          }}
                        >
                          🗑
                        </Button>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Quick Correlation Preview ---- */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Correlation Insights
          </h2>
          <Link
            href="/correlations"
            className="text-primary text-xs font-medium"
          >
            View all →
          </Link>
        </div>

        {correlationsQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card h-14 animate-pulse rounded-xl border"
              />
            ))}
          </div>
        ) : topCorrelations.length === 0 ? (
          <div className="bg-card rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">
              Not enough data yet for correlation analysis.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {topCorrelations.map((c, i) => (
              <Link
                key={i}
                href="/correlations"
                className={cn(
                  "bg-card flex items-center justify-between rounded-xl border p-3",
                )}
              >
                <div>
                  <p className="text-sm font-medium">
                    {c.metricA} → {c.metricB}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    r = {c.rValue.toFixed(2)} ·{" "}
                    {c.direction === "positive" ? "↑" : c.direction === "negative" ? "↓" : "→"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    c.strength === "strong"
                      ? "bg-green-500/20 text-green-400"
                      : c.strength === "moderate"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-zinc-700/50 text-zinc-400",
                  )}
                >
                  {c.strength}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
