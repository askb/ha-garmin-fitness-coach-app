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
  return d.toISOString().split("T")[0]!;
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
  const [metrics14, activities10, profile, latestReadiness, latestVo2, metrics30, journal7, interventions10, advancedMetrics42, baselines] =
    await Promise.all([
      // Last 14 days of daily metrics
      db.query.DailyMetric.findMany({
        where: and(
          eq(DailyMetric.userId, userId),
          gte(DailyMetric.date, dateNDaysAgo(14)),
        ),
        orderBy: desc(DailyMetric.date),
        limit: 14,
      }) as Promise<(typeof DailyMetric.$inferSelect)[]>,

      // Last 10 activities
      db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, new Date(Date.now() - 14 * 86_400_000)),
        ),
        orderBy: desc(Activity.startedAt),
        limit: 10,
      }) as Promise<(typeof Activity.$inferSelect)[]>,

      // Profile
      db.query.Profile.findFirst({
        where: eq(Profile.userId, userId),
      }) as Promise<typeof Profile.$inferSelect | undefined>,

      // Latest readiness score
      db.query.ReadinessScore.findFirst({
        where: eq(ReadinessScore.userId, userId),
        orderBy: desc(ReadinessScore.date),
      }) as Promise<typeof ReadinessScore.$inferSelect | undefined>,

      // Latest VO2max estimate
      db.query.VO2maxEstimate.findFirst({
        where: eq(VO2maxEstimate.userId, userId),
        orderBy: desc(VO2maxEstimate.date),
      }) as Promise<typeof VO2maxEstimate.$inferSelect | undefined>,

      // 30-day activities for zone distribution
      db.query.Activity.findMany({
        where: and(
          eq(Activity.userId, userId),
          gte(Activity.startedAt, new Date(Date.now() - 30 * 86_400_000)),
        ),
        orderBy: desc(Activity.startedAt),
        limit: 30,
      }) as Promise<(typeof Activity.$inferSelect)[]>,

      // 7 days of journal entries
      db.query.JournalEntry.findMany({
        where: and(
          eq(JournalEntry.userId, userId),
          gte(JournalEntry.date, dateNDaysAgo(7)),
        ),
        orderBy: desc(JournalEntry.date),
        limit: 7,
      }) as Promise<(typeof JournalEntry.$inferSelect)[]>,

      // Last 10 interventions
      db.query.Intervention.findMany({
        where: eq(Intervention.userId, userId),
        orderBy: desc(Intervention.date),
        limit: 10,
      }) as Promise<(typeof Intervention.$inferSelect)[]>,

      // Latest advanced metrics (last 42 days for CTL/ATL/TSB history)
      db.query.AdvancedMetric.findMany({
        where: and(
          eq(AdvancedMetric.userId, userId),
          gte(AdvancedMetric.date, dateNDaysAgo(42)),
        ),
        orderBy: desc(AdvancedMetric.date),
        limit: 42,
      }) as Promise<(typeof AdvancedMetric.$inferSelect)[]>,

      // Athlete baselines
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
        lines.push(`- Resting HR baseline: ${Math.round(profile.restingHrBaseline)} bpm`);
      if (profile.experienceLevel)
        lines.push(`- Experience: ${profile.experienceLevel}`);
      if (profile.goals && Array.isArray(profile.goals) && profile.goals.length > 0)
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
        a.strainScore != null
          ? `strain ${a.strainScore.toFixed(1)}`
          : "";
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
        | { zone1: number; zone2: number; zone3: number; zone4: number; zone5: number }
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
    const sleepDays = metrics14.slice(0, 7).filter((m) => m.totalSleepMinutes != null);
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
      if (latestDebt?.sleepDebtMinutes != null && latestDebt.sleepDebtMinutes > 0) {
        lines.push(`- Current sleep debt: ${fmtMin(latestDebt.sleepDebtMinutes)}`);
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
        const tagEntries = Object.entries(j.tags as Record<string, unknown>).slice(0, 3);
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
        const eff = i.effectivenessRating != null ? ` — effectiveness: ${i.effectivenessRating}/5` : "";
        const outcome = i.outcomeNotes ? ` — outcome: ${i.outcomeNotes.slice(0, 60)}` : "";
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
      lines.push(`- CTL (Fitness): ${latestAdv.ctl.toFixed(1)} | ATL (Fatigue): ${latestAdv.atl.toFixed(1)} | TSB (Form): ${latestAdv.tsb.toFixed(1)}`);
    if (latestAdv.acwr != null)
      lines.push(`- ACWR: ${latestAdv.acwr.toFixed(2)} (${acwrStatus(latestAdv.acwr)})`);
    if (latestAdv.rampRate != null)
      lines.push(`- Ramp Rate: ${latestAdv.rampRate > 0 ? "+" : ""}${latestAdv.rampRate.toFixed(1)}%`);
    if (latestAdv.cp != null) lines.push(`- CP: ${Math.round(latestAdv.cp)}w`);
    if (latestAdv.wPrime != null) lines.push(`- W': ${Math.round(latestAdv.wPrime)}J`);
    if (latestAdv.mftp != null) lines.push(`- mFTP: ${Math.round(latestAdv.mftp)}w`);
    if (latestAdv.effectiveVo2max != null)
      lines.push(`- Effective VO2max: ${latestAdv.effectiveVo2max.toFixed(1)}`);
    if (lines.length > 1) sections.push(lines.join("\n"));
  }

  // 10. Personal Baselines -------------------------------------------------
  if (baselines.length > 0) {
    const lines: string[] = ["## Personal Baselines (90-day)"];
    const today = metrics14[0];
    for (const b of baselines) {
      const sd = b.baselineSD != null ? ` (SD: ${b.baselineSD.toFixed(1)})` : "";
      let todayStr = "";
      if (b.zScoreLatest != null) {
        const z = b.zScoreLatest;
        const zLabel = z < -1.5 ? "well below baseline" : z < -0.5 ? "below baseline" : z > 1.5 ? "well above baseline" : z > 0.5 ? "above baseline" : "within normal range";
        todayStr = ` — today's z-score: ${z.toFixed(1)} (${zLabel})`;
      }
      if (b.metricName === "hrv") {
        const val = today?.hrv != null ? `, today: ${Math.round(today.hrv)} ms` : "";
        lines.push(`- HRV baseline: ${b.baselineValue.toFixed(1)} ms${sd}${todayStr}${val}`);
      } else if (b.metricName === "restingHr") {
        const val = today?.restingHr != null ? `, today: ${today.restingHr} bpm` : "";
        lines.push(`- Resting HR baseline: ${Math.round(b.baselineValue)} bpm${sd}${todayStr}${val}`);
      } else if (b.metricName === "sleep") {
        lines.push(`- Sleep baseline: ${fmtMin(b.baselineValue)}${sd}${todayStr}`);
      }
    }
    if (lines.length > 1) sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
