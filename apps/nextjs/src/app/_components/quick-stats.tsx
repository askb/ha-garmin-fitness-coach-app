"use client";

interface StatItem {
  label: string;
  value: string | number | null;
  unit?: string;
  icon: string;
}

export function QuickStats({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-card rounded-xl border px-4 py-3 text-center"
        >
          <span className="text-lg">{stat.icon}</span>
          <p className="text-foreground mt-1 text-lg font-semibold">
            {stat.value ?? "—"}
            {stat.unit && (
              <span className="text-muted-foreground ml-0.5 text-xs">
                {stat.unit}
              </span>
            )}
          </p>
          <p className="text-muted-foreground text-xs">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
