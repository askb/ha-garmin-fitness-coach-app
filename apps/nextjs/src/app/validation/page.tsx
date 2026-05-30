"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEASUREMENT_TYPES = [
  { key: "lab_vo2max", emoji: "🔬", label: "Lab VO2max" },
  { key: "lactate_threshold", emoji: "🩸", label: "Lactate Threshold" },
  { key: "body_composition", emoji: "⚖️", label: "Body Composition" },
  { key: "chest_strap_hr", emoji: "❤️", label: "Chest Strap HR" },
  { key: "ecg_hrv", emoji: "📊", label: "ECG HRV" },
  { key: "sleep_lab", emoji: "🛏️", label: "Sleep Lab" },
] as const;

type MeasurementTypeKey = (typeof MEASUREMENT_TYPES)[number]["key"];

const MEASUREMENT_UNITS: Record<MeasurementTypeKey, string> = {
  lab_vo2max: "ml/kg/min",
  lactate_threshold: "bpm",
  body_composition: "%",
  chest_strap_hr: "bpm",
  ecg_hrv: "ms",
  sleep_lab: "min",
};

const GARMIN_LABEL: Record<MeasurementTypeKey, string> = {
  lab_vo2max: "Garmin estimated VO2max on this date",
  lactate_threshold: "Garmin estimated lactate threshold HR on this date",
  body_composition: "Garmin body composition % on this date",
  chest_strap_hr: "Garmin average HR on this date",
  ecg_hrv: "Garmin HRV on this date",
  sleep_lab: "Garmin total sleep minutes on this date",
};

function today(): string {
  return new Date().toISOString().split("T")[0]!;
}

function deviationBadge(pct: number | null | undefined): React.ReactNode {
  if (pct == null) return null;
  const abs = Math.abs(pct);
  const sign = pct >= 0 ? "+" : "";
  if (abs < 5)
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        🟢 Excellent ({sign}
        {pct.toFixed(1)}%)
      </span>
    );
  if (abs < 10)
    return (
      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
        🟡 Good ({sign}
        {pct.toFixed(1)}%)
      </span>
    );
  if (abs < 15)
    return (
      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
        🟠 Fair ({sign}
        {pct.toFixed(1)}%)
      </span>
    );
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      🔴 Poor ({sign}
      {pct.toFixed(1)}%)
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface RvcRow {
  date: string;
  raw: number;
  computed: number;
  deltaPct: number | null;
  status: "match" | "minor" | "diverged";
}

const RVC_STATUS_STYLE: Record<RvcRow["status"], string> = {
  match: "bg-green-100 text-green-700",
  minor: "bg-yellow-100 text-yellow-700",
  diverged: "bg-red-100 text-red-700",
};

const RVC_STATUS_LABEL: Record<RvcRow["status"], string> = {
  match: "🟢 Match",
  minor: "🟡 Minor",
  diverged: "🔴 Diverged",
};

function RawVsComputedTable({
  title,
  hint,
  rows,
  unit,
}: {
  title: string;
  hint: string;
  rows: RvcRow[];
  unit: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mb-2 text-xs">{hint}</p>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Date</th>
              <th className="px-2 py-1.5 text-right font-medium">Garmin</th>
              <th className="px-2 py-1.5 text-right font-medium">Engine</th>
              <th className="px-2 py-1.5 text-right font-medium">Δ</th>
              <th className="px-2 py-1.5 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((r) => (
              <tr key={r.date} className="border-t">
                <td className="px-2 py-1.5">{r.date}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.raw.toFixed(1)}
                  {unit}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.computed.toFixed(1)}
                  {unit}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.deltaPct == null
                    ? "—"
                    : `${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(1)}%`}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${RVC_STATUS_STYLE[r.status]}`}
                  >
                    {RVC_STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ValidationPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [selectedType, setSelectedType] =
    useState<MeasurementTypeKey>("lab_vo2max");
  const [date, setDate] = useState(today());
  const [value, setValue] = useState("");
  const [garminValue, setGarminValue] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const unit = MEASUREMENT_UNITS[selectedType];

  const { data: measurements = [], isLoading } = useQuery(
    trpc.reference.list.queryOptions(),
  );

  const { data: rawVsComputed } = useQuery(
    trpc.dataQuality.getRawVsComputed.queryOptions({ days: 30 }),
  );

  const createMutation = useMutation(
    trpc.reference.create.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.reference.list.queryFilter());
        setValue("");
        setGarminValue("");
        setNotes("");
        toast.success("Reference measurement saved");
      },
      onError: () => toast.error("Failed to save measurement"),
    }),
  );

  const deleteMutation = useMutation(
    trpc.reference.delete.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.reference.list.queryFilter());
        setConfirmDelete(null);
        toast.success("Measurement deleted");
      },
      onError: () => toast.error("Failed to delete"),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(value);
    if (isNaN(num)) return toast.error("Enter a valid number");
    const garminNum = garminValue ? parseFloat(garminValue) : undefined;
    createMutation.mutate({
      measurementType: selectedType,
      date,
      value: num,
      unit,
      source: "manual",
      garminComparableValue: garminNum ?? null,
      notes: notes || null,
    });
  }

  // Match quality: average deviation % per type
  const matchQuality: Record<string, { sum: number; count: number }> = {};
  for (const m of measurements) {
    if (m.deviationPercent == null) continue;
    matchQuality[m.measurementType] ??= { sum: 0, count: 0 };
    matchQuality[m.measurementType]!.sum += Math.abs(m.deviationPercent);
    matchQuality[m.measurementType]!.count += 1;
  }

  return (
    <div className="bg-background text-foreground min-h-screen pb-20">
      {/* Header */}
      <div className="bg-card sticky top-0 z-10 border-b px-4 py-4 shadow-sm">
        <h1 className="text-foreground pl-12 text-xl font-bold">
          Data Validation
        </h1>
        <p className="text-muted-foreground mt-0.5 pl-12 text-sm">
          Compare Garmin estimates against reference measurements
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {/* Engine vs Garmin — raw vs computed transparency */}
        {rawVsComputed && rawVsComputed.summary.comparedPairs > 0 && (
          <div className="bg-card rounded-xl border p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-foreground font-semibold">
                Engine vs Garmin
              </h2>
              {rawVsComputed.summary.agreementPct != null && (
                <span className="text-muted-foreground text-xs">
                  {rawVsComputed.summary.agreementPct}% agreement ·{" "}
                  {rawVsComputed.summary.comparedPairs} pairs
                </span>
              )}
            </div>
            <p className="text-muted-foreground mb-3 text-xs">
              How PulseCoach&apos;s computed metrics compare to the raw values
              Garmin provides, over the last 30 days. Large divergences flag
              where the engine&apos;s model differs from Garmin&apos;s — useful
              for trust and debugging.
            </p>
            <div className="space-y-4">
              <RawVsComputedTable
                title="Readiness"
                hint="Garmin Training Readiness vs the Buchheit composite score."
                rows={rawVsComputed.readiness}
                unit=""
              />
              <RawVsComputedTable
                title="VO2max"
                hint="Garmin official VO2max vs engine effective VO2max."
                rows={rawVsComputed.vo2max}
                unit=""
              />
            </div>
          </div>
        )}

        {/* Add Reference Measurement */}
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <h2 className="text-foreground mb-3 font-semibold">
            Add Reference Measurement
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Type selector */}
            <div className="grid grid-cols-3 gap-2">
              {MEASUREMENT_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedType(t.key)}
                  className={`rounded-lg border p-2 text-center text-xs transition-colors ${
                    selectedType === t.key
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-border bg-card text-muted-foreground hover:border-border"
                  }`}
                >
                  <div className="text-lg">{t.emoji}</div>
                  <div className="mt-0.5 font-medium">{t.label}</div>
                </button>
              ))}
            </div>

            {/* Date */}
            <div>
              <label className="text-foreground mb-1 block text-sm font-medium">
                Date
              </label>
              <input
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
                className="border-border w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Value + unit */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-foreground mb-1 block text-sm font-medium">
                  Reference Value
                </label>
                <input
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 52.4"
                  className="border-border w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="w-28">
                <label className="text-foreground mb-1 block text-sm font-medium">
                  Unit
                </label>
                <div className="border-border bg-muted text-muted-foreground flex h-[38px] items-center rounded-lg border px-3 text-sm">
                  {unit}
                </div>
              </div>
            </div>

            {/* Garmin comparable */}
            <div>
              <label className="text-foreground mb-1 block text-sm font-medium">
                {GARMIN_LABEL[selectedType]}{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <input
                type="number"
                step="any"
                value={garminValue}
                onChange={(e) => setGarminValue(e.target.value)}
                placeholder={`Garmin's ${unit} estimate`}
                className="border-border w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-foreground mb-1 block text-sm font-medium">
                Notes{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Lab conditions, protocol, context…"
                className="border-border w-full resize-none rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <Button
              type="submit"
              disabled={createMutation.isPending || !value}
              className="w-full"
            >
              {createMutation.isPending ? "Saving…" : "Save Measurement"}
            </Button>
          </form>
        </div>

        {/* Match Quality Summary */}
        {Object.keys(matchQuality).length > 0 && (
          <div className="bg-card rounded-xl border p-4 shadow-sm">
            <h2 className="text-foreground mb-3 font-semibold">
              Match Quality
            </h2>
            <div className="space-y-2">
              {Object.entries(matchQuality).map(([type, { sum, count }]) => {
                const avg = sum / count;
                const typeInfo = MEASUREMENT_TYPES.find((t) => t.key === type);
                return (
                  <div
                    key={type}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-foreground">
                      {typeInfo?.emoji} {typeInfo?.label ?? type}
                      <span className="text-muted-foreground ml-1">
                        ({count} readings)
                      </span>
                    </span>
                    {deviationBadge(avg)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* History */}
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <h2 className="text-foreground mb-3 font-semibold">
            Reference Measurements
          </h2>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : measurements.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No reference measurements yet. Add a lab or reference value above
              to compare it against Garmin&apos;s estimate and track accuracy.
            </p>
          ) : (
            <div className="space-y-3">
              {measurements.map((m) => {
                const typeInfo = MEASUREMENT_TYPES.find(
                  (t) => t.key === m.measurementType,
                );
                return (
                  <div
                    key={m.id}
                    className="border-border rounded-lg border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-foreground flex items-center gap-1.5 text-sm font-medium">
                          <span>{typeInfo?.emoji ?? "📐"}</span>
                          <span>{typeInfo?.label ?? m.measurementType}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">
                            {m.date}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-foreground text-sm">
                            {m.value} {m.unit}
                          </span>
                          {m.garminComparableValue != null && (
                            <span className="text-muted-foreground text-xs">
                              Garmin: {m.garminComparableValue} {m.unit}
                            </span>
                          )}
                          {deviationBadge(m.deviationPercent)}
                        </div>
                        {m.notes && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {m.notes}
                          </p>
                        )}
                      </div>
                      <div>
                        {confirmDelete === m.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() =>
                                deleteMutation.mutate({ id: m.id })
                              }
                              className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-muted-foreground hover:bg-muted rounded px-2 py-1 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(m.id)}
                            className="text-muted-foreground hover:bg-muted rounded p-1 hover:text-red-500"
                            aria-label="Delete"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
