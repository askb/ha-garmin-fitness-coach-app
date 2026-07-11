"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import type { EndChoice, InteractionRec } from "./quick-add-lib";
import { BottomNav } from "../_components/bottom-nav";
import { getIngressUrl } from "../_components/ingress-provider";
import {
  DURATION_CHIPS,
  END_CHOICES,
  endIsoFromChoice,
  fmtEnd,
  parseApiResponse,
} from "./quick-add-lib";

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

interface GcalCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  selected?: boolean;
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
    skipped?: {
      total: number;
      no_hr: number;
      interactions_no_hr: number;
      no_hr_titles: string[];
      by_reason?: Record<string, number>;
    };
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

/** Stable short alias per attendee: "Waffle Nimbus" → WN, "jbolt" → JB.
 * Names are sorted first so collision suffixes don't depend on rank order. */
function buildMaskMap(people: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const name of [...people].sort()) {
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

  /* ─────────────── Google Calendar linking ─────────────── */
  const [tokenText, setTokenText] = useState("");
  const [showCals, setShowCals] = useState(false);
  // null = follow the server's saved selection; a Set = the user's edits.
  const [selectedOverride, setSelectedOverride] = useState<Set<string> | null>(
    null,
  );

  const link = useMutation({
    mutationFn: async () => {
      let payload: unknown;
      try {
        payload = JSON.parse(tokenText);
      } catch {
        throw new Error(
          "That isn't valid JSON — paste the whole gcal-token.json file.",
        );
      }
      const res = await fetch(getIngressUrl("/api/garmin/gcal-link"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!data.success) throw new Error(data.message ?? "Failed to link");
      return data;
    },
    onSuccess: () => {
      setTokenText("");
      setMessage(null);
      setShowCals(true);
      void queryClient.invalidateQueries({ queryKey: ["meeting-stress"] });
      void queryClient.invalidateQueries({ queryKey: ["gcal-calendars"] });
    },
    onError: (err) => setMessage(err.message),
  });

  const unlink = useMutation({
    mutationFn: async () => {
      const res = await fetch(getIngressUrl("/api/garmin/gcal-link"), {
        method: "DELETE",
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!data.success) throw new Error(data.message ?? "Failed to unlink");
      return data;
    },
    onSuccess: () => {
      setMessage(null);
      setShowCals(false);
      setSelectedOverride(null);
      void queryClient.invalidateQueries({ queryKey: ["meeting-stress"] });
      void queryClient.invalidateQueries({ queryKey: ["gcal-calendars"] });
    },
    onError: (err) => setMessage(err.message),
  });

  const { data: calData, isLoading: calLoading } = useQuery({
    queryKey: ["gcal-calendars"],
    queryFn: async (): Promise<{
      calendars?: GcalCalendar[];
      success?: boolean;
      message?: string;
    }> => {
      try {
        const res = await fetch(getIngressUrl("/api/garmin/gcal-calendars"));
        return (await res.json()) as {
          calendars?: GcalCalendar[];
          success?: boolean;
          message?: string;
        };
      } catch {
        return { success: false, message: "Cannot reach the addon." };
      }
    },
    // Only hit the addon once the panel is actually open.
    enabled: !!status?.calendar_linked && showCals,
  });

  const calendars = useMemo(() => calData?.calendars ?? [], [calData]);
  const calError =
    calData?.success === false
      ? (calData.message ?? "Could not load calendars.")
      : null;
  // Effective selection: the user's edits if any, else the server's saved set.
  const serverSelected = useMemo(
    () => new Set(calendars.filter((c) => c.selected).map((c) => c.id)),
    [calendars],
  );
  const selected = selectedOverride ?? serverSelected;

  const saveCals = useMutation({
    mutationFn: async () => {
      const res = await fetch(getIngressUrl("/api/garmin/gcal-calendars"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendar_ids: [...selected] }),
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!data.success) throw new Error(data.message ?? "Failed to save");
      return data;
    },
    onSuccess: () => {
      setMessage("Calendar selection saved — hit ▶ run to refresh.");
      setSelectedOverride(null);
      void queryClient.invalidateQueries({ queryKey: ["meeting-stress"] });
      void queryClient.invalidateQueries({ queryKey: ["gcal-calendars"] });
    },
    onError: (err) => setMessage(err.message),
  });

  /* ─────────────── interaction quick-add ─────────────── */
  const [personInput, setPersonInput] = useState("");
  const [minutes, setMinutes] = useState<number>(30);
  const [endChoice, setEndChoice] = useState<EndChoice>("now");

  const addonHealthy =
    !isLoading && !!status && !(status.unsupported ?? status.unreachable);

  const { data: ixData } = useQuery({
    queryKey: ["interactions"],
    queryFn: async (): Promise<{
      interactions?: InteractionRec[];
      success?: boolean;
      unsupported?: boolean;
    }> => {
      try {
        const res = await fetch(getIngressUrl("/api/garmin/interactions"));
        if (res.status === 404) return { success: false, unsupported: true };
        return (await res.json()) as {
          interactions?: InteractionRec[];
          success?: boolean;
        };
      } catch {
        return { success: false };
      }
    },
    enabled: addonHealthy,
  });
  const recent = ixData?.interactions ?? [];
  const ixSupported = !ixData?.unsupported;

  const addInteraction = useMutation({
    mutationFn: async () => {
      const res = await fetch(getIngressUrl("/api/garmin/interactions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person: personInput.trim(),
          minutes,
          end: endIsoFromChoice(endChoice),
        }),
      });
      const data = await parseApiResponse(res);
      if (!data.success) throw new Error(data.message ?? "Failed to log");
      return data;
    },
    onSuccess: () => {
      setPersonInput("");
      setEndChoice("now");
      setMessage("Logged — hit ▶ run to score it against your heart rate.");
      void queryClient.invalidateQueries({ queryKey: ["interactions"] });
    },
    onError: (err) => setMessage(err.message),
  });

  const deleteInteraction = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        getIngressUrl(`/api/garmin/interactions/${encodeURIComponent(id)}`),
        { method: "DELETE" },
      );
      const data = await parseApiResponse(res);
      if (!data.success) throw new Error(data.message ?? "Failed to delete");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["interactions"] });
    },
    onError: (err) => setMessage(err.message),
  });

  const canLog =
    personInput.trim().length > 0 &&
    !addInteraction.isPending &&
    minutes > 0 &&
    minutes <= 1440;

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

  // Notice for events dropped because Garmin hadn't synced HR for that window
  // (often a just-logged interaction). Built as one string so JSX whitespace
  // can't inject a stray space before punctuation; names only when unmasked.
  const skip = status?.results?.skipped;
  const noHrTitles = Array.isArray(skip?.no_hr_titles) ? skip.no_hr_titles : [];
  const skipNote =
    skip && skip.no_hr > 0
      ? `⚠ ${skip.no_hr} event${skip.no_hr === 1 ? "" : "s"} had no heart-rate coverage yet` +
        (skip.interactions_no_hr > 0
          ? ` (incl. ${skip.interactions_no_hr} logged interaction${
              skip.interactions_no_hr === 1 ? "" : "s"
            })`
          : "") +
        (!masked && noHrTitles.length > 0
          ? ` — ${noHrTitles.join(", ")}`
          : "") +
        `. They'll show once Garmin syncs that time window — then hit ▶ run again.`
      : null;

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
            {status?.calendar_linked && (
              <button
                onClick={() => setShowCals((s) => !s)}
                title="Choose calendars / unlink"
                className={cn(
                  "rounded border px-3 py-1.5 text-xs",
                  showCals
                    ? "border-sky-600 text-sky-400"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800",
                )}
              >
                📅 calendars
              </button>
            )}
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

        {skipNote && (
          <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
            {skipNote}
          </p>
        )}

        {status?.calendar_linked && showCals && (
          <div className="mb-3 rounded border border-sky-500/30 bg-sky-500/5 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-bold text-zinc-200">Google Calendars</p>
              <button
                onClick={() => unlink.mutate()}
                disabled={unlink.isPending}
                className="rounded border border-red-500/40 px-2 py-1 text-red-400 hover:bg-red-500/10"
              >
                {unlink.isPending ? "unlinking…" : "Unlink"}
              </button>
            </div>
            {calError ? (
              <p className="text-amber-400">{calError}</p>
            ) : calLoading ? (
              <p className="text-zinc-500">Loading calendars…</p>
            ) : calendars.length === 0 ? (
              <p className="text-zinc-500">
                No calendars found on this account.
              </p>
            ) : (
              <>
                <p className="mb-2 text-zinc-400">
                  Pick which calendars feed the board (events shared across
                  calendars are counted once).
                </p>
                <div className="mb-2 max-h-48 space-y-1 overflow-y-auto">
                  {calendars.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 text-zinc-300"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={(e) =>
                          setSelectedOverride((prev) => {
                            // Build from the latest state (prev), falling back
                            // to the server set, so rapid toggles never drop.
                            const next = new Set(prev ?? serverSelected);
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          })
                        }
                      />
                      <span>{c.summary}</span>
                      {c.primary && (
                        <span className="text-zinc-600">(primary)</span>
                      )}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => saveCals.mutate()}
                  disabled={saveCals.isPending || selected.size === 0}
                  className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-600"
                >
                  {saveCals.isPending ? "saving…" : "Save selection"}
                </button>
              </>
            )}
          </div>
        )}

        {addonHealthy && ixSupported && (
          <div className="mb-3 rounded border border-zinc-800 bg-zinc-900 p-3 text-xs">
            <p className="mb-2 font-bold tracking-widest text-zinc-100">
              LOG INTERACTION{" "}
              <span className="font-normal tracking-normal text-zinc-500">
                off-calendar chat, call, drop-by
              </span>
            </p>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (canLog) addInteraction.mutate();
              }}
            >
              <input
                value={personInput}
                onChange={(e) => setPersonInput(e.target.value)}
                list="known-people"
                placeholder="who?"
                autoComplete="off"
                autoCapitalize="off"
                className="w-36 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-200 placeholder:text-zinc-600"
              />
              <datalist id="known-people">
                {(results?.people ?? []).map((p) => (
                  <option key={p.attendee} value={p.attendee} />
                ))}
              </datalist>
              <span className="flex overflow-hidden rounded border border-zinc-700">
                {DURATION_CHIPS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinutes(m)}
                    className={cn(
                      "px-2 py-1.5",
                      minutes === m
                        ? "bg-zinc-700 font-bold text-zinc-100"
                        : "text-zinc-400 hover:bg-zinc-800",
                    )}
                  >
                    {m}m
                  </button>
                ))}
              </span>
              <select
                value={endChoice}
                onChange={(e) => setEndChoice(e.target.value as EndChoice)}
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-300"
              >
                {END_CHOICES.map((c) => (
                  <option key={c.key} value={c.key}>
                    ended {c.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!canLog}
                className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                {addInteraction.isPending ? "logging…" : "+ log"}
              </button>
            </form>
            {recent.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {recent.slice(0, 6).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 text-zinc-500"
                  >
                    <span className="text-zinc-300">{person(r.person)}</span>
                    <span>
                      {r.minutes}m · ended {fmtEnd(r.end)}
                    </span>
                    <button
                      onClick={() => deleteInteraction.mutate(r.id)}
                      disabled={deleteInteraction.isPending}
                      title="Remove this interaction"
                      aria-label={`Remove interaction with ${r.person}`}
                      className="rounded px-1 text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
              Connect Google Calendar
            </p>
            <p className="mb-2">
              On your computer, mint a read-only token with{" "}
              <code className="text-zinc-200">
                scripts/generate-gcal-token.py
              </code>{" "}
              (addon repo), then paste the contents of the resulting{" "}
              <code className="text-zinc-200">gcal-token.json</code> here:
            </p>
            <textarea
              value={tokenText}
              onChange={(e) => setTokenText(e.target.value)}
              rows={4}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-1p-ignore
              data-lpignore="true"
              placeholder='{"client_id":"…","client_secret":"…","refresh_token":"…"}'
              className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600"
            />
            <button
              onClick={() => link.mutate()}
              disabled={link.isPending || tokenText.trim().length === 0}
              className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-600"
            >
              {link.isPending ? "connecting…" : "Connect"}
            </button>
            <p className="mt-3 text-zinc-500">
              Prefer files? Drop the token in{" "}
              <code className="text-zinc-400">/share/pulsecoach/</code>, or
              export an ICS and convert it with{" "}
              <code className="text-zinc-400">scripts/ics_to_events.py</code>.
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
