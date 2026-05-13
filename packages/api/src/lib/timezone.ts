/**
 * Timezone-aware ISO date helpers used by analytics aggregation.
 *
 * Lives in `lib/` so unit tests can import these helpers without pulling in
 * the full analytics router (and its DB / engine imports).
 */

// Cache `Intl.DateTimeFormat` per zone — `aggregateDailyLoads` calls
// `dayInTimezone` once per activity, and constructing a formatter is the
// expensive part. The formatter itself is thread-safe (V8 builtin) and
// stateless w.r.t. the input date.
const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getFormatter(zone: string): Intl.DateTimeFormat {
  let fmt = FORMATTER_CACHE.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    FORMATTER_CACHE.set(zone, fmt);
  }
  return fmt;
}

/**
 * Project a `Date` onto a calendar day in a specific IANA timezone.
 *
 * Returns an ISO `YYYY-MM-DD` string. We resolve via `Intl.DateTimeFormat`
 * (zero-dependency, ships with V8) so a workout finished at 23:30 UTC on
 * day N appears on day N+1 for an athlete in Sydney and on day N for an
 * athlete in San Francisco. Falls back to UTC if the zone is invalid.
 */
export function dayInTimezone(
  date: Date,
  tz: string | null | undefined,
): string {
  const zone = tz && tz.length > 0 ? tz : "UTC";
  try {
    // `en-CA` renders as YYYY-MM-DD natively, no parsing needed.
    return getFormatter(zone).format(date);
  } catch {
    // Invalid TZ string — degrade to UTC rather than crashing the request.
    return date.toISOString().split("T")[0]!;
  }
}

/**
 * Compute "today" in the athlete's timezone as a `YYYY-MM-DD` string.
 * Used as the upper bound when zero-padding the daily-load series.
 */
export function todayInTimezone(tz: string | null | undefined): string {
  return dayInTimezone(new Date(), tz);
}

/**
 * Step a `YYYY-MM-DD` string by N days. Operates on the date string
 * directly so it is timezone-stable (no DST spring-forward bug).
 */
export function shiftIsoDay(isoDay: string, deltaDays: number): string {
  // Anchor at noon UTC to dodge DST midnight ambiguities, then shift in
  // days. Output is the bare YYYY-MM-DD prefix only.
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().split("T")[0]!;
}
