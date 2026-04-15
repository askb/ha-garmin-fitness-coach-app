"use client";

import { cn } from "@acme/ui";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "28d", days: 28 },
  { label: "90d", days: 90 },
  { label: "180d", days: 180 },
  { label: "1y", days: 365 },
] as const;

interface DateRangeSelectorProps {
  value: number;
  onChange: (days: number) => void;
  presets?: readonly { readonly label: string; readonly days: number }[];
  className?: string;
}

export function DateRangeSelector({
  value,
  onChange,
  presets = PRESETS,
  className,
}: DateRangeSelectorProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {presets.map((p) => (
        <button
          type="button"
          key={p.days}
          onClick={() => onChange(p.days)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === p.days
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
