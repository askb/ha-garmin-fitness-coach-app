// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

/**
 * Returns the user's configured IANA timezone (e.g. "Australia/Brisbane")
 * from the Profile record, falling back to the browser's resolved zone,
 * and finally to "UTC" if both are unavailable.
 *
 * Why a hook? Server-side rendering uses the container's TZ (UTC in the
 * HAOS addon) which makes raw `Date.toLocaleString()` show times 10+ hours
 * off for AEST users. Resolving the user's TZ from their profile and
 * passing it into every `Intl.DateTimeFormat` call fixes that.
 */
export function useUserTimezone(): string {
  const trpc = useTRPC();
  const profile = useQuery(trpc.profile.get.queryOptions());
  if (profile.data?.timezone) return profile.data.timezone;
  if (typeof Intl !== "undefined") {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      // fall through
    }
  }
  return "UTC";
}

function toDate(value: Date | string | number, timezone?: string): Date | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Anchoring a bare YYYY-MM-DD at noon UTC breaks at IANA zones whose
    // offset from UTC is >12h (e.g. Pacific/Kiritimati at UTC+14, or some
    // historical zones at UTC-12+DST). When a target timezone is supplied,
    // probe both 12:00 UTC and 00:00 UTC and pick the one whose calendar
    // day in `timezone` matches the requested Y-M-D.
    const noonUtc = new Date(`${value}T12:00:00.000Z`);
    if (!timezone) return noonUtc;
    const dayInTz = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    if (dayInTz(noonUtc) === value) return noonUtc;
    const midnightUtc = new Date(`${value}T00:00:00.000Z`);
    if (dayInTz(midnightUtc) === value) return midnightUtc;
    const lateUtc = new Date(`${value}T23:00:00.000Z`);
    if (dayInTz(lateUtc) === value) return lateUtc;
    return noonUtc;
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date in the user's timezone. Returns "—" for invalid inputs
 * so callers can pass DB values directly without null-guarding.
 */
export function formatDateInTz(
  value: Date | string | number | null | undefined,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  },
): string {
  if (value == null) return "—";
  const d = toDate(value, timezone);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: timezone,
  }).format(d);
}

export function getGreeting(date: Date, timezone: string): string {
  const rawHour = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(date);
  const hour = Number.parseInt(rawHour, 10) % 24;

  if (hour >= 5 && hour <= 11) return "Good morning ☀️";
  if (hour >= 12 && hour <= 16) return "Good afternoon 🌤️";
  if (hour >= 17 && hour <= 21) return "Good evening 🌙";
  return "Good night ✨";
}

/**
 * Format the time-of-day in the user's timezone.
 */
export function formatTimeInTz(
  value: Date | string | number | null | undefined,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
): string {
  if (value == null) return "—";
  const d = toDate(value, timezone);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: timezone,
  }).format(d);
}
