/** Pure helpers for the Stress Board interaction quick-add. */

export interface InteractionRec {
  id: string;
  person: string;
  minutes: number;
  end: string;
}

/**
 * Parse a mutation response without letting a non-JSON body (e.g. an HTML
 * 500 page) surface as a SyntaxError — fall back to the HTTP status.
 */
export async function parseApiResponse(
  res: Pick<Response, "json" | "status">,
): Promise<{ success: boolean; message?: string }> {
  try {
    return (await res.json()) as { success: boolean; message?: string };
  } catch {
    return {
      success: false,
      message: `Unexpected response (HTTP ${res.status})`,
    };
  }
}

/** "Ended…" choices: key → minutes ago. "now" is the server default. */
export const END_CHOICES = [
  { key: "now", label: "just now", minutesAgo: 0 },
  { key: "30m", label: "30 min ago", minutesAgo: 30 },
  { key: "1h", label: "1 hour ago", minutesAgo: 60 },
  { key: "2h", label: "2 hours ago", minutesAgo: 120 },
  { key: "4h", label: "4 hours ago", minutesAgo: 240 },
] as const;

export type EndChoice = (typeof END_CHOICES)[number]["key"];

export const DURATION_CHIPS = [15, 30, 45, 60] as const;

/**
 * ISO timestamp for a relative end choice, or undefined for "just now"
 * (the addon then stamps now server-side, avoiding clock skew).
 */
export function endIsoFromChoice(
  choice: EndChoice,
  now: Date = new Date(),
): string | undefined {
  const found = END_CHOICES.find((c) => c.key === choice);
  if (!found || found.minutesAgo === 0) return undefined;
  return new Date(now.getTime() - found.minutesAgo * 60_000).toISOString();
}

/** Compact "ended" stamp for the recent list: time today, date+time before. */
export function fmtEnd(endIso: string, now: Date = new Date()): string {
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return endIso;
  const sameDay = end.toDateString() === now.toDateString();
  const time = end.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return time;
  return `${end.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}
