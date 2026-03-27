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
  { key: "sleep_lab", emoji: "😴", label: "Sleep Lab" },
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
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white px-4 py-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Data Validation</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Compare Garmin estimates against reference measurements
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {/* Add Reference Measurement */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-800">
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
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <div className="text-lg">{t.emoji}</div>
                  <div className="mt-0.5 font-medium">{t.label}</div>
                </button>
              ))}
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Date
              </label>
              <input
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Value + unit */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Reference Value
                </label>
                <input
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 52.4"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="w-28">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Unit
                </label>
                <div className="flex h-[38px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
                  {unit}
                </div>
              </div>
            </div>

            {/* Garmin comparable */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {GARMIN_LABEL[selectedType]}{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="number"
                step="any"
                value={garminValue}
                onChange={(e) => setGarminValue(e.target.value)}
                placeholder={`Garmin's ${unit} estimate`}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notes{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Lab conditions, protocol, context…"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-gray-800">Match Quality</h2>
            <div className="space-y-2">
              {Object.entries(matchQuality).map(([type, { sum, count }]) => {
                const avg = sum / count;
                const typeInfo = MEASUREMENT_TYPES.find((t) => t.key === type);
                return (
                  <div
                    key={type}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-700">
                      {typeInfo?.emoji} {typeInfo?.label ?? type}
                      <span className="ml-1 text-gray-400">
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
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-800">
            Reference Measurements
          </h2>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : measurements.length === 0 ? (
            <p className="text-sm text-gray-500">
              No reference measurements yet. Add one above to compare Garmin
              accuracy.
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
                    className="rounded-lg border border-gray-100 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                          <span>{typeInfo?.emoji ?? "📐"}</span>
                          <span>{typeInfo?.label ?? m.measurementType}</span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-500">{m.date}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm text-gray-700">
                            {m.value} {m.unit}
                          </span>
                          {m.garminComparableValue != null && (
                            <span className="text-xs text-gray-400">
                              Garmin: {m.garminComparableValue} {m.unit}
                            </span>
                          )}
                          {deviationBadge(m.deviationPercent)}
                        </div>
                        {m.notes && (
                          <p className="mt-1 text-xs text-gray-500">
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
                              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(m.id)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
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
