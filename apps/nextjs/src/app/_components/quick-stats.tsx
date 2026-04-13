"use client";

type MetricZone = "good" | "caution" | "concern";

interface StatItem {
  label: string;
  value: string | number | null;
  unit?: string;
  icon: string;
  /** Numeric value for scale computation (0-100) */
  scale?: number;
  /** Qualitative zone for color coding */
  zone?: MetricZone;
  /** Contextual label (e.g., "Optimal", "Low") */
  zoneLabel?: string;
}

const ZONE_COLORS: Record<MetricZone, { text: string; bg: string; bar: string }> = {
  good: { text: "text-green-400", bg: "bg-green-500/10", bar: "bg-green-500" },
  caution: { text: "text-yellow-400", bg: "bg-yellow-500/10", bar: "bg-yellow-500" },
  concern: { text: "text-red-400", bg: "bg-red-500/10", bar: "bg-red-500" },
};

export function QuickStats({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => {
        const zone = stat.zone ?? "good";
        const colors = ZONE_COLORS[zone];
        return (
          <div
            key={stat.label}
            className={`rounded-xl border px-4 py-3 text-center ${stat.zone ? colors.bg : "bg-card"}`}
          >
            <span className="text-lg">{stat.icon}</span>
            <p className={`mt-1 text-lg font-semibold ${stat.zone ? colors.text : "text-foreground"}`}>
              {stat.value ?? "—"}
              {stat.unit && (
                <span className="text-muted-foreground ml-0.5 text-xs">
                  {stat.unit}
                </span>
              )}
            </p>
            {/* Scale bar */}
            {stat.scale != null && (
              <div className="mx-auto mt-1.5 h-1 w-full max-w-[80px] overflow-hidden rounded-full bg-zinc-700">
                <div
                  className={`h-full rounded-full transition-all ${colors.bar}`}
                  style={{ width: `${Math.min(100, Math.max(0, stat.scale))}%` }}
                />
              </div>
            )}
            <p className="text-muted-foreground text-xs">{stat.label}</p>
            {stat.zoneLabel && (
              <p className={`text-[10px] font-medium ${colors.text}`}>
                {stat.zoneLabel}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
