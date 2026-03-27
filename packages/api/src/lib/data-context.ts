// ---------------------------------------------------------------------------
// Build a structured text summary of the athlete's Garmin data for the LLM.
// ---------------------------------------------------------------------------

import { and, desc, eq, gte } from "@acme/db";
import {
  Activity,
  AdvancedMetric,
  AthleteBaseline,
  DailyMetric,
  Intervention,
  JournalEntry,
  Profile,
  ReadinessScore,
  VO2maxEstimate,
} from "@acme/db/schema";
import {
  computeACWR,
  computeStrainScore,
  computeTrainingLoads,
  countConsecutiveHardDays,
} from "@acme/engine";

// Drizzle db type — keep generic to avoid coupling to the concrete client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0] ?? "";
}

function fmtMin(mins: number | null | undefined): string {
  if (mins == null) return "N/A";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function classifyVO2max(
  value: number,
  age: number | null | undefined,
  sex: string | null | undefined,
): string {
  // Simplified ACSM percentile classification
  if (sex === "female") {
    if (value >= 45) return "Excellent";
    if (value >= 38) return "Good";
    if (value >= 31) return "Fair";
    return "Below average";
  }
  // male / unknown
  if (value >= 52) return "Excellent";
  if (value >= 43) return "Good";
  if (value >= 36) return "Fair";
  return "Below average";
}

function acwrStatus(acwr: number): string {
  if (acwr < 0.8) return "Under-training zone";
  if (acwr <= 1.3) return "Sweet spot";
  if (acwr <= 1.5) return "Caution zone";
  return "High injury risk";
}

// ---------------------------------------------------------------------------
// Main context builder
// ---------------------------------------------------------------------------

/**
 * Gathers the athlete's Garmin data from the database and formats it as a
 * concise structured-text summary that can be injected into the LLM system
 * prompt.  Returns an empty string if there is no data at all.
 */
export async function buildDataContext(
  db: DB,
  userId: string,
): Promise<string> {
  // Parallel queries -------------------------------------------------------
  const [
    metrics14,
    activities10,
    profile,
    latestReadiness,
    latestVo2,
    metrics30,
    journal7,
    interventions10,
    advancedMetrics42,
    baselines,
  ] = await Promise.all([
    // Last 14 days of daily metrics
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.DailyMetric.findMany({
      where: and(
        eq(DailyMetric.userId, userId),
        gte(DailyMetric.date, dateNDaysAgo(14)),
      ),
      orderBy: desc(DailyMetric.date),
      limit: 14,
    }) as Promise<(typeof DailyMetric.$inferSelect)[]>,

    // Last 10 activities
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        gte(Activity.startedAt, new Date(Date.now() - 14 * 86_400_000)),
      ),
      orderBy: desc(Activity.startedAt),
      limit: 10,
    }) as Promise<(typeof Activity.$inferSelect)[]>,

    // Profile
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.Profile.findFirst({
      where: eq(Profile.userId, userId),
    }) as Promise<typeof Profile.$inferSelect | undefined>,

    // Latest readiness score
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.ReadinessScore.findFirst({
      where: eq(ReadinessScore.userId, userId),
      orderBy: desc(ReadinessScore.date),
    }) as Promise<typeof ReadinessScore.$inferSelect | undefined>,

    // Latest VO2max estimate
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.VO2maxEstimate.findFirst({
      where: eq(VO2maxEstimate.userId, userId),
      orderBy: desc(VO2maxEstimate.date),
    }) as Promise<typeof VO2maxEstimate.$inferSelect | undefined>,

    // 30-day activities for zone distribution
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.Activity.findMany({
      where: and(
        eq(Activity.userId, userId),
        gte(Activity.startedAt, new Date(Date.now() - 30 * 86_400_000)),
      ),
      orderBy: desc(Activity.startedAt),
      limit: 30,
    }) as Promise<(typeof Activity.$inferSelect)[]>,

    // 7 days of journal entries
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.JournalEntry.findMany({
      where: and(
        eq(JournalEntry.userId, userId),
        gte(JournalEntry.date, dateNDaysAgo(7)),
      ),
      orderBy: desc(JournalEntry.date),
      limit: 7,
    }) as Promise<(typeof JournalEntry.$inferSelect)[]>,

    // Last 10 interventions
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.Intervention.findMany({
      where: eq(Intervention.userId, userId),
      orderBy: desc(Intervention.date),
      limit: 10,
    }) as Promise<(typeof Intervention.$inferSelect)[]>,

    // Latest advanced metrics (last 42 days for CTL/ATL/TSB history)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.AdvancedMetric.findMany({
      where: and(
        eq(AdvancedMetric.userId, userId),
        gte(AdvancedMetric.date, dateNDaysAgo(42)),
      ),
      orderBy: desc(AdvancedMetric.date),
      limit: 42,
    }) as Promise<(typeof AdvancedMetric.$inferSelect)[]>,

    // Athlete baselines
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    db.query.AthleteBaseline.findMany({
      where: eq(AthleteBaseline.userId, userId),
    }) as Promise<(typeof AthleteBaseline.$inferSelect)[]>,
  ]);

  // Early exit if no data at all
  if (!profile && metrics14.length === 0 && activities10.length === 0) {
    return "No athlete data available yet — Garmin has not been synced.";
  }

  const sections: string[] = [];

  // 1. Athlete Profile -----------------------------------------------------
  {
    const lines: string[] = ["## Athlete Profile"];
    if (profile) {
      if (profile.age) lines.push(`- Age: ${profile.age}`);
      if (profile.massKg) lines.push(`- Weight: ${profile.massKg} kg`);
      if (profile.sex) lines.push(`- Sex: ${profile.sex}`);
      if (profile.maxHr) lines.push(`- Max HR: ${profile.maxHr} bpm`);
      if (profile.restingHrBaseline)
        lines.push(
          `- Resting HR baseline: ${Math.round(profile.restingHrBaseline)} bpm`,
        );
      if (profile.experienceLevel)
        lines.push(`- Experience: ${profile.experienceLevel}`);
      if (
        profile.goals &&
        Array.isArray(profile.goals) &&
        profile.goals.length > 0
      )
        lines.push(
          `- Goals: ${profile.goals.map((g) => `${g.sport} ${g.goalType}${g.target ? ` (${g.target})` : ""}`).join("; ")}`,
        );
    }
    if (latestVo2) {
      const classification = classifyVO2max(
        latestVo2.value,
        profile?.age,
        profile?.sex,
      );
      lines.push(
        `- VO2max: ${latestVo2.value.toFixed(1)} ml/kg/min (${classification}) [${latestVo2.sport}]`,
      );
    } else if (profile?.vo2maxRunning) {
      const classification = classifyVO2max(
        profile.vo2maxRunning,
        profile.age,
        profile.sex,
      );
      lines.push(
        `- VO2max (profile): ${profile.vo2maxRunning.toFixed(1)} ml/kg/min (${classification})`,
      );
    }
    // Health information
    if (profile) {
      if (profile.heightCm) lines.push(`- Height: ${profile.heightCm} cm`);
      if (profile.lactateThreshold)
        lines.push(`- Lactate Threshold HR: ${profile.lactateThreshold} bpm`);
      if (profile.functionalThresholdPower)
        lines.push(`- FTP: ${profile.functionalThresholdPower} W`);
      if (profile.hrvBaseline)
        lines.push(`- HRV baseline: ${Math.round(profile.hrvBaseline)} ms`);
      if (profile.sleepBaseline)
        lines.push(
          `- Sleep baseline: ${Math.round(profile.sleepBaseline)} min`,
        );

      const conditions = profile.healthConditions;
      if (conditions && conditions.length > 0)
        lines.push(`- Health conditions: ${conditions.join(", ")}`);

      const injuries = profile.currentInjuries as
        | {
            bodyPart: string;
            severity: string;
            since?: string;
            notes?: string;
          }[]
        | null;
      if (injuries && injuries.length > 0)
        lines.push(
          `- Current injuries: ${injuries.map((i) => `${i.bodyPart} (${i.severity}${i.since ? `, since ${i.since}` : ""}${i.notes ? ` — ${i.notes}` : ""})`).join("; ")}`,
        );

      if (profile.medications)
        lines.push(`- Medications: ${profile.medications}`);
      if (profile.allergies)
        lines.push(`- Allergies/sensitivities: ${profile.allergies}`);
    }
    sections.push(lines.join("\n"));
  }

  // 2. Training Load -------------------------------------------------------
  {
    const strainScores = activities10.map(
      (a) => a.strainScore ?? computeStrainScore(a.trimpScore ?? 0),
    );
    const loads = computeTrainingLoads([...strainScores].reverse());
    const acwr = computeACWR(strainScores);
    const hardDays = countConsecutiveHardDays(strainScores);

    const lines: string[] = ["## Training Load"];
    lines.push(`- CTL (Fitness): ${loads.ctl.toFixed(1)}`);
    lines.push(`- ATL (Fatigue): ${loads.atl.toFixed(1)}`);
    lines.push(`- TSB (Form): ${loads.tsb.toFixed(1)}`);
    lines.push(`- Ramp Rate: ${loads.rampRate.toFixed(1)} pts/week`);
    lines.push(`- ACWR: ${acwr.toFixed(2)} (${acwrStatus(acwr)})`);
    lines.push(`- Consecutive hard days: ${hardDays}`);
    sections.push(lines.join("\n"));
  }

  // 3. Recent Activities ---------------------------------------------------
  if (activities10.length > 0) {
    const lines: string[] = ["## Recent Activities (Last 14 Days)"];
    for (const a of activities10) {
      const dur = Math.round(a.durationMinutes);
      const hr = a.avgHr ? `HR ${a.avgHr}` : "no HR";
      const strain =
        a.strainScore != null ? `strain ${a.strainScore.toFixed(1)}` : "";
      const dist =
        a.distanceMeters != null
          ? `${(a.distanceMeters / 1000).toFixed(1)}km`
          : "";
      lines.push(
        `- ${a.sportType}: ${dur}min${dist ? `, ${dist}` : ""}, ${hr}${strain ? `, ${strain}` : ""}`,
      );
    }
    sections.push(lines.join("\n"));
  }

  // 4. Zone Distribution (30 days) ----------------------------------------
  {
    let totalZ1 = 0,
      totalZ2 = 0,
      totalZ3 = 0,
      totalZ4 = 0,
      totalZ5 = 0;
    let hasZoneData = false;
    for (const a of metrics30) {
      const zones = a.hrZoneMinutes as
        | {
            zone1: number;
            zone2: number;
            zone3: number;
            zone4: number;
            zone5: number;
          }
        | null
        | undefined;
      if (zones) {
        hasZoneData = true;
        totalZ1 += zones.zone1;
        totalZ2 += zones.zone2;
        totalZ3 += zones.zone3;
        totalZ4 += zones.zone4;
        totalZ5 += zones.zone5;
      }
    }
    if (hasZoneData) {
      const total = totalZ1 + totalZ2 + totalZ3 + totalZ4 + totalZ5 || 1;
      const pct = (v: number) => ((v / total) * 100).toFixed(1);
      const lines: string[] = ["## Zone Distribution (Last 30 Days)"];
      lines.push(`- Zone 1 (Recovery): ${pct(totalZ1)}%`);
      lines.push(`- Zone 2 (Aerobic): ${pct(totalZ2)}%`);
      lines.push(`- Zone 3 (Tempo): ${pct(totalZ3)}%`);
      lines.push(`- Zone 4 (Threshold): ${pct(totalZ4)}%`);
      lines.push(`- Zone 5 (VO2max): ${pct(totalZ5)}%`);
      sections.push(lines.join("\n"));
    }
  }

  // 5. Sleep (last 7 days) -------------------------------------------------
  {
    const sleepDays = metrics14
      .slice(0, 7)
      .filter((m) => m.totalSleepMinutes != null);
    if (sleepDays.length > 0) {
      const lines: string[] = ["## Sleep (Last 7 Days)"];
      for (const d of sleepDays) {
        const score = d.sleepScore != null ? `score ${d.sleepScore}` : "";
        const hrv = d.hrv != null ? `HRV ${Math.round(d.hrv)}` : "";
        lines.push(
          `- ${d.date}: ${fmtMin(d.totalSleepMinutes)}${score ? `, ${score}` : ""}${hrv ? `, ${hrv}` : ""}`,
        );
      }
      // Sleep debt
      const latestDebt = sleepDays.find((d) => d.sleepDebtMinutes != null);
      if (
        latestDebt?.sleepDebtMinutes != null &&
        latestDebt.sleepDebtMinutes > 0
      ) {
        lines.push(
          `- Current sleep debt: ${fmtMin(latestDebt.sleepDebtMinutes)}`,
        );
      }
      sections.push(lines.join("\n"));
    }
  }

  // 6. Readiness & Recovery ------------------------------------------------
  {
    const today = metrics14[0];
    const lines: string[] = ["## Readiness & Recovery"];
    if (latestReadiness) {
      lines.push(
        `- Readiness Score: ${latestReadiness.score}/100 (${latestReadiness.zone})`,
      );
    }
    if (today) {
      if (today.bodyBatteryEnd != null)
        lines.push(`- Body Battery: ${today.bodyBatteryEnd}%`);
      if (today.stressScore != null)
        lines.push(`- Stress: ${today.stressScore}`);
      if (today.hrv != null)
        lines.push(`- Today's HRV: ${Math.round(today.hrv)} ms`);
      if (today.restingHr != null)
        lines.push(`- Resting HR: ${today.restingHr} bpm`);
    }
    if (lines.length > 1) sections.push(lines.join("\n"));
  }

  // 7. Journal (last 7 days) -----------------------------------------------
  if (journal7.length > 0) {
    const lines: string[] = ["## Journal (Last 7 Days)"];
    for (const j of journal7) {
      const parts: string[] = [];
      if (j.sorenessScore != null) {
        const regions =
          Array.isArray(j.sorenessRegions) && j.sorenessRegions.length > 0
            ? ` (${j.sorenessRegions.slice(0, 3).join(", ")})`
            : "";
        parts.push(`soreness=${j.sorenessScore}${regions}`);
      }
      if (j.moodScore != null) parts.push(`mood=${j.moodScore}`);
      if (j.alcoholDrinks != null && j.alcoholDrinks > 0)
        parts.push(`alcohol=${j.alcoholDrinks}`);
      if (j.caffeineAmountMg != null && j.caffeineAmountMg > 0)
        parts.push(`caffeine=${j.caffeineAmountMg}mg`);
      // Top tags from JSONB
      if (j.tags && typeof j.tags === "object") {
        const tagEntries = Object.entries(
          j.tags as Record<string, unknown>,
        ).slice(0, 3);
        for (const [k, v] of tagEntries) parts.push(`${k}=${String(v)}`);
      }
      const tagStr = parts.length > 0 ? parts.join(", ") : "";
      const notesStr = j.notes ? `, notes: "${j.notes.slice(0, 80)}"` : "";
      lines.push(`- ${j.date}: ${tagStr}${notesStr}`);
    }
    sections.push(lines.join("\n"));
  }

  // 8. Interventions (recent) ----------------------------------------------
  if (interventions10.length > 0) {
    const cutoff = dateNDaysAgo(30);
    const recent = interventions10.filter((i) => i.date >= cutoff);
    if (recent.length > 0) {
      const lines: string[] = ["## Recent Interventions (Last 30 Days)"];
      for (const i of recent) {
        const eff =
          i.effectivenessRating != null
            ? ` — effectiveness: ${i.effectivenessRating}/5`
            : "";
        const outcome = i.outcomeNotes
          ? ` — outcome: ${i.outcomeNotes.slice(0, 60)}`
          : "";
        const desc = i.description ? ` — ${i.description.slice(0, 60)}` : "";
        lines.push(`- ${i.date}: [${i.type}]${desc}${eff}${outcome}`);
      }
      sections.push(lines.join("\n"));
    }
  }

  // 9. Advanced Load Metrics -----------------------------------------------
  const latestAdv = advancedMetrics42[0];
  if (latestAdv) {
    const lines: string[] = ["## Advanced Load Metrics (Latest)"];
    if (latestAdv.ctl != null && latestAdv.atl != null && latestAdv.tsb != null)
      lines.push(
        `- CTL (Fitness): ${latestAdv.ctl.toFixed(1)} | ATL (Fatigue): ${latestAdv.atl.toFixed(1)} | TSB (Form): ${latestAdv.tsb.toFixed(1)}`,
      );
    if (latestAdv.acwr != null)
      lines.push(
        `- ACWR: ${latestAdv.acwr.toFixed(2)} (${acwrStatus(latestAdv.acwr)})`,
      );
    if (latestAdv.rampRate != null)
      lines.push(
        `- Ramp Rate: ${latestAdv.rampRate > 0 ? "+" : ""}${latestAdv.rampRate.toFixed(1)}%`,
      );
    if (latestAdv.cp != null) lines.push(`- CP: ${Math.round(latestAdv.cp)}w`);
    if (latestAdv.wPrime != null)
      lines.push(`- W': ${Math.round(latestAdv.wPrime)}J`);
    if (latestAdv.mftp != null)
      lines.push(`- mFTP: ${Math.round(latestAdv.mftp)}w`);
    if (latestAdv.effectiveVo2max != null)
      lines.push(`- Effective VO2max: ${latestAdv.effectiveVo2max.toFixed(1)}`);
    if (lines.length > 1) sections.push(lines.join("\n"));
  }

  // 10. Personal Baselines -------------------------------------------------
  if (baselines.length > 0) {
    const lines: string[] = ["## Personal Baselines (90-day)"];
    const today = metrics14[0];
    for (const b of baselines) {
      const sd =
        b.baselineSD != null ? ` (SD: ${b.baselineSD.toFixed(1)})` : "";
      let todayStr = "";
      if (b.zScoreLatest != null) {
        const z = b.zScoreLatest;
        const zLabel =
          z < -1.5
            ? "well below baseline"
            : z < -0.5
              ? "below baseline"
              : z > 1.5
                ? "well above baseline"
                : z > 0.5
                  ? "above baseline"
                  : "within normal range";
        todayStr = ` — today's z-score: ${z.toFixed(1)} (${zLabel})`;
      }
      if (b.metricName === "hrv") {
        const val =
          today?.hrv != null ? `, today: ${Math.round(today.hrv)} ms` : "";
        lines.push(
          `- HRV baseline: ${b.baselineValue.toFixed(1)} ms${sd}${todayStr}${val}`,
        );
      } else if (b.metricName === "restingHr") {
        const val =
          today?.restingHr != null ? `, today: ${today.restingHr} bpm` : "";
        lines.push(
          `- Resting HR baseline: ${Math.round(b.baselineValue)} bpm${sd}${todayStr}${val}`,
        );
      } else if (b.metricName === "sleep") {
        lines.push(
          `- Sleep baseline: ${fmtMin(b.baselineValue)}${sd}${todayStr}`,
        );
      }
    }
    if (lines.length > 1) sections.push(lines.join("\n"));
  }

  // 11. Metric Trends (Direction & Rate of Change) --------------------------
  {
    const lines: string[] = ["## Metric Trends (Direction & Rate of Change)"];

    const trendEmoji = (pctChange: number): string => {
      if (pctChange > 2) return "↑";
      if (pctChange < -2) return "↓";
      return "→";
    };

    const fmtPct = (v: number): string =>
      `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

    // Helper: find a metric value N days ago from a sorted (desc) array
    const findValueNDaysAgo = <T extends { date: string }>(
      arr: T[],
      daysAgo: number,
      getter: (item: T) => number | null | undefined,
    ): number | null => {
      const target = dateNDaysAgo(daysAgo);
      // Find closest entry on or before the target date
      for (const item of arr) {
        if (item.date <= target) {
          const v = getter(item);
          return v ?? null;
        }
      }
      return null;
    };

    const latestAdvMetric = advancedMetrics42[0];

    // CTL trend
    if (latestAdvMetric?.ctl != null) {
      const ctl7 = findValueNDaysAgo(advancedMetrics42, 7, (m) => m.ctl);
      const ctl30 = findValueNDaysAgo(advancedMetrics42, 30, (m) => m.ctl);
      const now = latestAdvMetric.ctl;
      if (ctl7 != null) {
        const pct = ctl7 !== 0 ? ((now - ctl7) / Math.abs(ctl7)) * 100 : 0;
        const label =
          pct > 2
            ? "improving fitness"
            : pct < -2
              ? "declining fitness"
              : "stable fitness";
        lines.push(
          `- CTL: ${ctl7.toFixed(1)} → ${now.toFixed(1)} over 7 days (${trendEmoji(pct)} ${fmtPct(pct)}, ${label})`,
        );
      }
      if (ctl30 != null) {
        const pct = ctl30 !== 0 ? ((now - ctl30) / Math.abs(ctl30)) * 100 : 0;
        lines.push(
          `- CTL 30-day: ${ctl30.toFixed(1)} → ${now.toFixed(1)} (${trendEmoji(pct)} ${fmtPct(pct)})`,
        );
      }
    }

    // ATL trend
    if (latestAdvMetric?.atl != null) {
      const atl7 = findValueNDaysAgo(advancedMetrics42, 7, (m) => m.atl);
      const now = latestAdvMetric.atl;
      if (atl7 != null) {
        const pct = atl7 !== 0 ? ((now - atl7) / Math.abs(atl7)) * 100 : 0;
        const label =
          pct > 2
            ? "increasing fatigue"
            : pct < -2
              ? "decreasing fatigue"
              : "stable fatigue";
        lines.push(
          `- ATL: ${atl7.toFixed(1)} → ${now.toFixed(1)} over 7 days (${trendEmoji(pct)} ${fmtPct(pct)}, ${label})`,
        );
      }
    }

    // TSB trend
    if (latestAdvMetric?.tsb != null) {
      const tsb7 = findValueNDaysAgo(advancedMetrics42, 7, (m) => m.tsb);
      const now = latestAdvMetric.tsb;
      if (tsb7 != null) {
        const pct = tsb7 !== 0 ? ((now - tsb7) / Math.abs(tsb7)) * 100 : 0;
        const label =
          now < -20
            ? "overreaching risk"
            : pct < -2
              ? "declining form — may need deload"
              : pct > 2
                ? "improving form"
                : "stable form";
        lines.push(
          `- TSB: ${tsb7.toFixed(1)} → ${now.toFixed(1)} over 7 days (${trendEmoji(pct)} ${label})`,
        );
      }
    }

    // ACWR trend
    if (latestAdvMetric?.acwr != null) {
      const acwr7 = findValueNDaysAgo(advancedMetrics42, 7, (m) => m.acwr);
      const now = latestAdvMetric.acwr;
      if (acwr7 != null) {
        const pct = acwr7 !== 0 ? ((now - acwr7) / Math.abs(acwr7)) * 100 : 0;
        const rangeLabel =
          now >= 0.8 && now <= 1.3
            ? "within safe range"
            : now > 1.3
              ? "elevated — injury risk"
              : "under-training zone";
        lines.push(
          `- ACWR: ${acwr7.toFixed(2)} → ${now.toFixed(2)} over 7 days (${trendEmoji(pct)} ${rangeLabel})`,
        );
      }
    }

    // Resting HR trend (from metrics14)
    const todayMetric = metrics14[0];
    const day7Metric = metrics14.find((m) => m.date <= dateNDaysAgo(7));
    if (todayMetric?.restingHr != null && day7Metric?.restingHr != null) {
      const now = todayMetric.restingHr;
      const prev = day7Metric.restingHr;
      const pct = prev !== 0 ? ((now - prev) / Math.abs(prev)) * 100 : 0;
      const hrBaseline = baselines.find((b) => b.metricName === "restingHr");
      let zContext = "";
      if (hrBaseline?.zScoreLatest != null) {
        const z = hrBaseline.zScoreLatest;
        zContext =
          z > 1.0 ? " — above baseline" : z < -1.0 ? " — below baseline" : "";
      }
      lines.push(
        `- Resting HR: ${prev} → ${now} bpm over 7 days (${trendEmoji(pct)} ${fmtPct(pct)}${zContext})`,
      );
    }

    // HRV trend (from metrics14)
    if (todayMetric?.hrv != null && day7Metric?.hrv != null) {
      const now = todayMetric.hrv;
      const prev = day7Metric.hrv;
      const pct = prev !== 0 ? ((now - prev) / Math.abs(prev)) * 100 : 0;
      const hrvBaseline = baselines.find((b) => b.metricName === "hrv");
      let zContext = "";
      if (hrvBaseline?.zScoreLatest != null) {
        const z = hrvBaseline.zScoreLatest;
        zContext =
          z < -1.5 ? " — recovery concern" : z < -0.5 ? " — monitor" : "";
      }
      lines.push(
        `- HRV: ${Math.round(prev)} → ${Math.round(now)} ms over 7 days (${trendEmoji(pct)} ${fmtPct(pct)}${zContext})`,
      );
    }

    // Sleep score trend (7-day avg vs prior 7-day avg from metrics14)
    {
      const recent7 = metrics14.slice(0, 7).filter((m) => m.sleepScore != null);
      const prior7 = metrics14.slice(7, 14).filter((m) => m.sleepScore != null);
      if (recent7.length >= 3 && prior7.length >= 3) {
        const recentAvg =
          recent7.reduce((s, m) => s + (m.sleepScore ?? 0), 0) / recent7.length;
        const priorAvg =
          prior7.reduce((s, m) => s + (m.sleepScore ?? 0), 0) / prior7.length;
        const pct =
          priorAvg !== 0
            ? ((recentAvg - priorAvg) / Math.abs(priorAvg)) * 100
            : 0;
        const label =
          pct < -2
            ? "declining — prioritize sleep"
            : pct > 2
              ? "improving"
              : "stable";
        lines.push(
          `- Sleep Score: ${Math.round(priorAvg)} → ${Math.round(recentAvg)} avg over 7 days (${trendEmoji(pct)} ${label})`,
        );
      }
    }

    // VO2max trend (30-day)
    if (latestVo2) {
      const vo2_30 = findValueNDaysAgo(
        advancedMetrics42,
        30,
        (m) => m.effectiveVo2max,
      );
      if (vo2_30 != null) {
        const now = latestVo2.value;
        const pct =
          vo2_30 !== 0 ? ((now - vo2_30) / Math.abs(vo2_30)) * 100 : 0;
        const label =
          Math.abs(pct) <= 2
            ? "stable, no significant change in 30 days"
            : pct > 0
              ? "improving"
              : "declining";
        lines.push(
          `- VO2max: ${vo2_30.toFixed(1)} → ${now.toFixed(1)} over 30 days (${trendEmoji(pct)} ${label})`,
        );
      } else {
        lines.push(
          `- VO2max: ${latestVo2.value.toFixed(1)} (insufficient history for trend)`,
        );
      }
    }

    if (lines.length > 1) sections.push(lines.join("\n"));
  }

  // 12. Chart Interpretation Guide ------------------------------------------
  {
    const lines: string[] = ["## Chart Interpretation Guide"];
    const latestAdvMetric = advancedMetrics42[0];

    // PMC Chart interpretation
    if (
      latestAdvMetric?.ctl != null &&
      latestAdvMetric.atl != null &&
      latestAdvMetric.tsb != null
    ) {
      const ctl7 = advancedMetrics42.find((m) => m.date <= dateNDaysAgo(7));
      let rampNote = "";
      if (ctl7?.ctl != null && latestAdvMetric.rampRate != null) {
        rampNote =
          Math.abs(latestAdvMetric.rampRate) > 8
            ? ` Ramp rate ${latestAdvMetric.rampRate.toFixed(1)}% exceeds safe limit (5-8%). Reduce volume.`
            : ` Ramp rate ${latestAdvMetric.rampRate.toFixed(1)}%/week (safe <5-8 pts).`;
      }
      const tsbNote =
        latestAdvMetric.tsb < -20
          ? ` TSB at ${latestAdvMetric.tsb.toFixed(1)} suggests overreaching — consider a 5-7 day deload.`
          : latestAdvMetric.tsb < -10
            ? ` TSB at ${latestAdvMetric.tsb.toFixed(1)} suggests moderate fatigue. Consider a 3-5 day taper if racing soon.`
            : latestAdvMetric.tsb > 5
              ? ` TSB at ${latestAdvMetric.tsb.toFixed(1)} — well rested, ready for quality sessions or racing.`
              : ` TSB at ${latestAdvMetric.tsb.toFixed(1)} — balanced training/recovery.`;
      lines.push(
        `- **PMC Chart (Training)**: CTL ${latestAdvMetric.ctl.toFixed(1)}, ATL ${latestAdvMetric.atl.toFixed(1)}.${rampNote}${tsbNote}`,
      );
    }

    // Zone Distribution interpretation
    {
      let totalZ1 = 0,
        totalZ2 = 0,
        totalZ3 = 0,
        totalZ4 = 0,
        totalZ5 = 0;
      let hasZoneData = false;
      for (const a of metrics30) {
        const zones = a.hrZoneMinutes as
          | {
              zone1: number;
              zone2: number;
              zone3: number;
              zone4: number;
              zone5: number;
            }
          | null
          | undefined;
        if (zones) {
          hasZoneData = true;
          totalZ1 += zones.zone1;
          totalZ2 += zones.zone2;
          totalZ3 += zones.zone3;
          totalZ4 += zones.zone4;
          totalZ5 += zones.zone5;
        }
      }
      if (hasZoneData) {
        const total = totalZ1 + totalZ2 + totalZ3 + totalZ4 + totalZ5 || 1;
        const pctZ12 = ((totalZ1 + totalZ2) / total) * 100;
        const pctZ3 = (totalZ3 / total) * 100;
        const _pctZ45 = ((totalZ4 + totalZ5) / total) * 100;
        const pct = (v: number) => ((v / total) * 100).toFixed(0);
        let advice = "";
        if (pctZ3 > 25) {
          advice = ` Too much Zone 3 (no man's land) at ${pctZ3.toFixed(0)}%. Target: 75-80% Zone 1-2, 15-20% Zone 4-5, <5% Zone 3.`;
        } else if (pctZ12 < 70) {
          advice = ` Low-intensity volume at ${pctZ12.toFixed(0)}% is below the 75-80% polarized target. Add more easy sessions.`;
        } else {
          advice = ` Distribution looks reasonable for polarized training.`;
        }
        lines.push(
          `- **Zone Distribution (Zones)**: Current split ${pct(totalZ1)}/${pct(totalZ2)}/${pct(totalZ3)}/${pct(totalZ4)}/${pct(totalZ5)}% (Z1-Z5).${advice}`,
        );
      }
    }

    // Sleep interpretation
    {
      const sleepDays = metrics14
        .slice(0, 7)
        .filter((m) => m.totalSleepMinutes != null);
      if (sleepDays.length > 0) {
        const avgMinutes =
          sleepDays.reduce((s, m) => s + (m.totalSleepMinutes ?? 0), 0) /
          sleepDays.length;
        const avgHours = avgMinutes / 60;
        const advice =
          avgHours < 7
            ? ` Below 7h threshold. 1-month target: 7+ hours avg.`
            : avgHours < 8
              ? ` Adequate but could benefit from targeting 8h for performance gains (Mah et al.).`
              : ` Excellent sleep duration supporting recovery.`;
        lines.push(
          `- **Sleep (Sleep)**: Average ${avgHours.toFixed(1)}h this week.${advice}`,
        );
      }
    }

    // Readiness interpretation
    if (latestReadiness) {
      const score = latestReadiness.score;
      const advice =
        score < 40
          ? ` Below 40 threshold — deload recommended. Reduce training intensity and volume.`
          : score < 60
            ? ` Moderate readiness. Avoid high-intensity work; prioritize easy sessions and recovery.`
            : score < 80
              ? ` Good readiness. Proceed with planned training, monitor how you feel.`
              : ` Excellent readiness. Ideal day for quality/hard sessions.`;
      lines.push(
        `- **Readiness (Dashboard)**: Score ${score}/100 — ${latestReadiness.zone}.${advice}`,
      );
    }

    // ACWR interpretation
    if (latestAdvMetric?.acwr != null) {
      const acwr = latestAdvMetric.acwr;
      const advice =
        acwr > 1.5
          ? ` HIGH injury risk. Immediately reduce acute load. Skip planned intensity.`
          : acwr > 1.3
            ? ` CAUTION zone. Reduce intensity this week. Avoid adding new stressors.`
            : acwr < 0.8
              ? ` Under-training. Gradually increase training stimulus to avoid detraining.`
              : ` No action needed — maintain current training approach.`;
      lines.push(
        `- **ACWR Gauge (Training)**: ${acwr.toFixed(2)} — ${acwrStatus(acwr)}.${advice}`,
      );
    }

    // Resting HR autonomic stress check
    {
      const hrBaseline = baselines.find((b) => b.metricName === "restingHr");
      if (hrBaseline?.zScoreLatest != null && hrBaseline.zScoreLatest < -1.5) {
        lines.push(
          `- **Autonomic Stress Alert**: Resting HR z-score ${hrBaseline.zScoreLatest.toFixed(1)} indicates significant autonomic stress. Prioritize recovery and consider skipping high-intensity sessions.`,
        );
      }
    }

    if (lines.length > 1) sections.push(lines.join("\n"));
  }

  const result = sections.join("\n\n");

  // Cap context size to prevent OOM — LLMs work fine with summarized data
  if (result.length > 4000) {
    return result.slice(0, 4000) + "\n\n[... context trimmed for performance]";
  }

  return result;
}
