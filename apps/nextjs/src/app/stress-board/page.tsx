"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { BottomNav } from "../_components/bottom-nav";
import { getIngressUrl } from "../_components/ingress-provider";

/* ─────────────── types (shape of meeting_stress.json) ─────────────── */

interface MeetingRow {
  title: string;
  attendees: string[];
  dbpm: number;
  z: number;
  elev: number;
}

interface PersonRow {
  attendee: string;
  n: number;
  naive: number;
  ridge: number;
  reliability: string;
  label: string;
}

interface StressStatus {
  running?: boolean;
  error?: string;
  unsupported?: boolean;
  unreachable?: boolean;
  calendar_linked?: boolean;
  events_file?: boolean;
  results?: {
    generated: string;
    meetings: MeetingRow[];
    people: PersonRow[];
  };
}

/* ─────────────── helpers ─────────────── */

function dbpmColor(v: number): string {
  if (v >= 5) return "text-red-400";
  if (v >= 2) return "text-orange-400";
  if (v > -0.5) return "text-zinc-400";
  return "text-green-400";
}

function labelColor(label: string): string {
  if (label === "prime suspect") return "text-red-400";
  if (label === "mild stressor") return "text-orange-400";
  if (label === "slightly raises HR") return "text-yellow-400";
  if (label === "calming") return "text-green-400";
  return "text-zinc-400";
}

async function fetchStatus(): Promise<StressStatus> {
  try {
    const res = await fetch(getIngressUrl("/api/garmin/meeting-stress"));
    return (await res.json()) as StressStatus;
  } catch {
    return { running: false, unreachable: true };
  }
}

/** Stable short alias per attendee: "Casey Cain" → CC, "mwatkins" → MW. */
function buildMaskMap(people: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const name of people) {
    const words = name.split(/[\s._-]+/).filter(Boolean);
    let alias =
      words.length > 1
        ? words.map((w) => (w[0] ?? "").toUpperCase()).join("")
        : name.slice(0, 2).toUpperCase();
    let candidate = alias;
    let i = 2;
    while (used.has(candidate)) candidate = `${alias}${i++}`;
    alias = candidate;
    used.add(alias);
    map.set(name, alias);
  }
  return map;
}

/* ─────────────── page ─────────────── */

export default function StressBoardPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [masked, setMasked] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["meeting-stress"],
    queryFn: fetchStatus,
    refetchInterval: (query) => (query.state.data?.running ? 5_000 : false),
  });

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch(getIngressUrl("/api/garmin/meeting-stress"), {
        method: "POST",
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!data.success) throw new Error(data.message ?? "Failed to start");
      return data;
    },
    onSuccess: () => {
      setMessage(null);
      void queryClient.invalidateQueries({ queryKey: ["meeting-stress"] });
    },
    onError: (err) => setMessage(err.message),
  });

  const results = status?.results;
  const maxAbsRidge = useMemo(
    () => Math.max(1, ...(results?.people ?? []).map((p) => Math.abs(p.ridge))),
    [results],
  );
  const maskMap = useMemo(
    () => buildMaskMap((results?.people ?? []).map((p) => p.attendee)),
    [results],
  );
  // Screenshot mode: alias people, hide meeting titles (titles leak names too).
  const person = (name: string) =>
    masked ? (maskMap.get(name) ?? "??") : name;
  const title = (t: string, i: number) => (masked ? `meeting #${i + 1}` : t);
  const hasSource = !!(status?.calendar_linked ?? status?.events_file);
  const broken = !!(status?.unsupported ?? status?.unreachable);
  // Setup guidance only when status loaded, addon healthy, and no source.
  const showSetup = !isLoading && !!status && !broken && !hasSource;

  return (
    <main className="min-h-screen bg-zinc-950 pb-24 font-mono text-sm text-zinc-200">
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-100">
              STRESS BOARD{" "}
              <span className="text-xs font-normal text-zinc-500">
                who spikes my heart rate
              </span>
            </h1>
            <p className="text-xs text-zinc-500">
              {isLoading || !status
                ? "calendar: checking…"
                : status.calendar_linked
                  ? "calendar: linked (Google)"
                  : status.events_file
                    ? "calendar: file (/share/pulsecoach)"
                    : "calendar: not connected"}
              {results?.generated
                ? ` · last run ${new Date(results.generated).toLocaleString()}`
                : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMasked((m) => !m)}
              title="Mask names for screenshots"
              className={cn(
                "rounded border px-3 py-1.5 text-xs",
                masked
                  ? "border-yellow-600 text-yellow-400"
                  : "border-zinc-700 text-zinc-400 hover:bg-zinc-800",
              )}
            >
              {masked ? "🙈 masked" : "👁 names"}
            </button>
            <button
              onClick={() => run.mutate()}
              disabled={status?.running || run.isPending || !hasSource}
              className={cn(
                "rounded border border-zinc-700 px-3 py-1.5 text-xs",
                status?.running || run.isPending
                  ? "cursor-wait text-zinc-500"
                  : "text-zinc-200 hover:bg-zinc-800",
              )}
            >
              {status?.running ? "running…" : "▶ run"}
            </button>
          </div>
        </div>

        {message && (
          <p className="mb-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
            {message}
          </p>
        )}

        {!showSetup && !results && !isLoading && (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-400">
            {status?.unsupported
              ? "Addon does not expose meeting stress yet — update to v0.20.0+."
              : status?.unreachable
                ? "Cannot reach the addon auth server."
                : "No results yet — hit ▶ run."}
          </p>
        )}

        {showSetup && (
          <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-400">
            <p className="mb-2 font-bold text-zinc-300">
              No calendar connected
            </p>
            <p>
              Link Google Calendar with{" "}
              <code className="text-zinc-200">
                scripts/generate-gcal-token.py
              </code>{" "}
              (addon repo) and drop the token in{" "}
              <code className="text-zinc-200">/share/pulsecoach/</code> — or
              export an ICS and convert it with{" "}
              <code className="text-zinc-200">scripts/ics_to_events.py</code>.
            </p>
          </div>
        )}

        {results && (
          <>
            {/* PER-PERSON leaderboard — the headline, like the post */}
            <section className="mb-6">
              <h2 className="mb-1 border-b border-zinc-800 pb-1 text-xs font-bold tracking-widest text-zinc-100">
                PER-PERSON{" "}
                <span className="font-normal text-zinc-500">
                  ranked by ridge marginal effect (bpm)
                </span>
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="py-1 pr-2 font-normal">attendee</th>
                    <th className="pr-2 text-right font-normal">n</th>
                    <th className="pr-2 text-right font-normal">naive</th>
                    <th className="pr-2 text-right font-normal">ridge</th>
                    <th className="pr-2 font-normal">rel</th>
                    <th className="pr-2 font-normal">calming ← 0 → stress</th>
                    <th className="font-normal">label</th>
                  </tr>
                </thead>
                <tbody>
                  {results.people.map((p) => {
                    const w = Math.round(
                      (Math.abs(p.ridge) / maxAbsRidge) * 48,
                    );
                    return (
                      <tr key={p.attendee} className="align-middle">
                        <td className="py-0.5 pr-2 font-bold text-zinc-100">
                          {person(p.attendee)}
                        </td>
                        <td className="pr-2 text-right">{p.n}</td>
                        <td className="pr-2 text-right">
                          {p.naive.toFixed(2)}
                        </td>
                        <td
                          className={cn(
                            "pr-2 text-right font-bold",
                            dbpmColor(p.ridge),
                          )}
                        >
                          {p.ridge.toFixed(2)}
                        </td>
                        <td className="pr-2 text-zinc-500">{p.reliability}</td>
                        <td className="pr-2">
                          <div className="flex h-3 w-28 items-center">
                            <div className="flex w-14 justify-end">
                              {p.ridge < 0 && (
                                <div
                                  className="h-2.5 bg-green-500/70"
                                  style={{ width: `${Math.min(w, 56)}px` }}
                                />
                              )}
                            </div>
                            <div className="h-3 w-px bg-zinc-600" />
                            <div className="w-14">
                              {p.ridge > 0 && (
                                <div
                                  className="h-2.5 bg-red-500/70"
                                  style={{ width: `${Math.min(w, 56)}px` }}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={labelColor(p.label)}>{p.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {/* MEETING STRESS table */}
            <section className="mb-6">
              <h2 className="mb-1 border-b border-zinc-800 pb-1 text-xs font-bold tracking-widest text-zinc-100">
                MEETING STRESS{" "}
                <span className="font-normal text-zinc-500">
                  mean HR over surrounding baseline
                </span>
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="py-1 pr-2 text-right font-normal">dbpm</th>
                    <th className="pr-2 text-right font-normal">z</th>
                    <th className="pr-2 text-right font-normal">elev</th>
                    <th className="pr-2 font-normal">meeting</th>
                    <th className="font-normal">attendees</th>
                  </tr>
                </thead>
                <tbody>
                  {results.meetings.map((m, i) => (
                    <tr key={i}>
                      <td
                        className={cn(
                          "py-0.5 pr-2 text-right font-bold",
                          dbpmColor(m.dbpm),
                        )}
                      >
                        {m.dbpm >= 0 ? "+" : ""}
                        {m.dbpm.toFixed(1)}
                      </td>
                      <td className="pr-2 text-right">{m.z.toFixed(2)}</td>
                      <td className="pr-2 text-right">
                        {Math.round(m.elev * 100)}%
                      </td>
                      <td className="max-w-40 truncate pr-2 text-zinc-100">
                        {title(m.title, i)}
                      </td>
                      <td className="text-zinc-500">
                        {m.attendees.map(person).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <p className="text-[10px] text-zinc-600">
              correlation ≠ causation — a leaderboard for laughs, not HR. thin
              data (n &lt; 3) ranks are noise.
            </p>
          </>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
