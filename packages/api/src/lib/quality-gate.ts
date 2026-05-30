// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
//
// LLM OUTPUT QUALITY GATE
//
// A post-generation, deterministic check over free-text coach replies. It
// extracts unit-bearing numeric claims (e.g. "42 km", "HR 154", "VO2max
// 53.4") from the model's answer and cross-checks each against the numbers
// the model was actually given in the data-context block. Claims with no
// supporting datum are flagged as potential hallucinations and the reply is
// assigned a confidence tier.
//
// Design goals:
//   - Zero false-positive bias: only numbers carrying a fitness unit (or a
//     conspicuous decimal) are treated as claims; bare small integers used
//     in prose ("3 runs", "2 days") are ignored.
//   - Non-destructive: we annotate / score, never silently rewrite the text.
//   - Pure & dependency-free: trivially unit-testable.

export interface NumericClaim {
  /** The raw matched substring, e.g. "42 km". */
  text: string;
  /** Parsed numeric value. */
  value: number;
  /** Normalised unit token, or null for a bare decimal. */
  unit: string | null;
}

export type Confidence = "high" | "medium" | "low";

export interface QualityResult {
  confidence: Confidence;
  claims: NumericClaim[];
  unsupportedClaims: NumericClaim[];
  /** Fraction of claims backed by the data context (1 when there are none). */
  supportedRatio: number;
}

// Units that mark a number as a quantitative fitness claim.
const UNIT_PATTERN =
  "km|kms|kilometers?|mi|miles?|m|bpm|kg|kgs|lbs?|%|percent|min|mins|minutes?|hrs?|hours?|ml\\/kg(?:\\/min)?|w|watts?|spm|kcal|cal|°c?|bps";

// number (optionally decimal / comma-grouped) immediately followed by a unit.
const UNITED_NUMBER = new RegExp(
  String.raw`(\d[\d,]*(?:\.\d+)?)\s*(${UNIT_PATTERN})\b`,
  "gi",
);

// "HR 154", "VO2max 53.4", "TSB +12", "CTL 48", "ACWR 1.35", "readiness 72".
const LABELLED_NUMBER = new RegExp(
  String.raw`\b(HR|HRV|VO2\s?max|VO₂\s?max|TSB|CTL|ATL|ACWR|readiness|strain|pace)\b\s*[:=]?\s*([+-]?\d[\d,]*(?:\.\d+)?)`,
  "gi",
);

function parseNum(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function normUnit(u: string): string {
  const l = u.toLowerCase();
  if (l === "percent") return "%";
  if (l.startsWith("kilometer") || l === "kms") return "km";
  if (l.startsWith("mile")) return "mi";
  if (l.startsWith("minute") || l === "mins") return "min";
  if (l.startsWith("hour") || l === "hrs") return "hr";
  if (l.startsWith("watt")) return "w";
  return l;
}

/**
 * Extract quantitative claims from a free-text reply. Skips an appended
 * markdown disclaimer block (everything after a `---` horizontal rule) so the
 * boilerplate is never scored.
 */
export function extractNumericClaims(text: string): NumericClaim[] {
  const body = text.split(/\n-{3,}\n/)[0] ?? text;
  const claims: NumericClaim[] = [];
  const seen = new Set<string>();

  const push = (raw: string, value: number, unit: string | null) => {
    if (!Number.isFinite(value)) return;
    const key = `${value}|${unit ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    claims.push({ text: raw.trim(), value, unit });
  };

  for (const m of body.matchAll(UNITED_NUMBER)) {
    const raw = m[0];
    const numStr = m[1];
    if (numStr === undefined) continue;
    push(raw, parseNum(numStr), normUnit(m[2] ?? ""));
  }
  for (const m of body.matchAll(LABELLED_NUMBER)) {
    const raw = m[0];
    const label = m[1];
    const numStr = m[2];
    if (numStr === undefined || label === undefined) continue;
    push(raw, parseNum(numStr), label.toLowerCase().replace(/\s+/g, ""));
  }

  return claims;
}

/**
 * Collect every numeric token present in the ground-truth data context into a
 * set, so claims can be checked against what the model was actually told.
 */
export function collectSupportedNumbers(context: string): number[] {
  const out: number[] = [];
  for (const m of context.matchAll(/[+-]?\d[\d,]*(?:\.\d+)?/g)) {
    const n = parseNum(m[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * A claim is supported when some context number matches within a small
 * tolerance (the larger of ±1 absolute or ±2 %), which absorbs the model
 * rounding "9.8 km" to "10 km" etc.
 */
function isSupported(value: number, supported: number[]): boolean {
  const tol = Math.max(1, Math.abs(value) * 0.02);
  return supported.some((s) => Math.abs(s - value) <= tol);
}

/**
 * Evaluate a generated reply against its data context. Returns the flagged
 * claims and an overall confidence tier:
 *   - high   : no claims, or every claim supported
 *   - medium : a minority of claims unsupported
 *   - low    : a majority of claims unsupported
 */
export function evaluateResponseQuality(
  response: string,
  context: string,
): QualityResult {
  const claims = extractNumericClaims(response);
  const supported = collectSupportedNumbers(context);

  const unsupportedClaims = claims.filter(
    (c) => !isSupported(c.value, supported),
  );

  const supportedRatio =
    claims.length === 0
      ? 1
      : (claims.length - unsupportedClaims.length) / claims.length;

  let confidence: Confidence;
  if (unsupportedClaims.length === 0) confidence = "high";
  else if (supportedRatio >= 0.5) confidence = "medium";
  else confidence = "low";

  return { confidence, claims, unsupportedClaims, supportedRatio };
}

/**
 * Build a short, honest caution banner when the gate is not fully confident.
 * Returns an empty string for high-confidence replies so nothing is appended.
 */
export function qualityBadge(result: QualityResult): string {
  if (result.confidence === "high") return "";
  const n = result.unsupportedClaims.length;
  const figures = result.unsupportedClaims
    .slice(0, 4)
    .map((c) => c.text)
    .join(", ");
  const lead =
    result.confidence === "low"
      ? "⚠️ Low confidence: several figures above are not in your synced data and may be estimates"
      : "⚠️ Some figures above are not in your synced data and may be estimates";
  return `\n\n> ${lead}${
    n > 0 ? ` (${figures}${n > 4 ? ", …" : ""})` : ""
  }. Ask for a specific date range to get verified numbers.`;
}
