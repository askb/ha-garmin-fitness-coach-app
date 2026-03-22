"use client";

import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { BottomNav } from "../_components/bottom-nav";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTERVENTION_TYPES = [
  { key: "reduced_load", emoji: "😴", label: "Reduced Load" },
  { key: "extra_sleep", emoji: "🛌", label: "Extra Sleep" },
  { key: "physio", emoji: "🏥", label: "Physio" },
  { key: "nutrition_change", emoji: "🥗", label: "Nutrition" },
  { key: "deload_week", emoji: "📉", label: "Deload Week" },
  { key: "travel_recovery", emoji: "✈️", label: "Travel Recovery" },
  { key: "ice_bath", emoji: "🧊", label: "Ice Bath" },
  { key: "compression", emoji: "🧦", label: "Compression" },
  { key: "massage", emoji: "💆", label: "Massage" },
  { key: "meditation", emoji: "🧘", label: "Meditation" },
  { key: "other", emoji: "➕", label: "Other" },
] as const;

type InterventionType = (typeof INTERVENTION_TYPES)[number]["key"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getTypeInfo(key: string) {
  return (
    INTERVENTION_TYPES.find((t) => t.key === key) ?? {
      key,
      emoji: "➕",
      label: key,
    }
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InterventionsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // -- Form state --
  const [date, setDate] = useState(toDateStr(new Date()));
  const [selectedType, setSelectedType] = useState<InterventionType | null>(
    null,
  );
  const [description, setDescription] = useState("");

  // -- Outcome editing --
  const [editingOutcome, setEditingOutcome] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // -- Queries --
  const listQuery = useQuery(trpc.intervention.list.queryOptions({}));

  // -- Mutations --
  const createMutation = useMutation(
    trpc.intervention.create.mutationOptions({
      onSuccess: () => {
        toast.success("Intervention logged");
        setSelectedType(null);
        setDescription("");
        void queryClient.invalidateQueries(trpc.intervention.pathFilter());
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.intervention.update.mutationOptions({
      onSuccess: () => {
        toast.success("Updated");
        setEditingOutcome(null);
        void queryClient.invalidateQueries(trpc.intervention.pathFilter());
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.intervention.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Deleted");
        setDeleteConfirm(null);
        void queryClient.invalidateQueries(trpc.intervention.pathFilter());
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function handleSave() {
    if (!selectedType) {
      toast.error("Please select an intervention type");
      return;
    }
    createMutation.mutate({
      date,
      type: selectedType,
      description: description || undefined,
    });
  }

  function handleRating(id: string, rating: number) {
    updateMutation.mutate({ id, effectivenessRating: rating });
  }

  function startOutcomeEdit(id: string, current: string | null) {
    setEditingOutcome(id);
    setOutcomeText(current ?? "");
  }

  function saveOutcome(id: string) {
    updateMutation.mutate({ id, outcomeNotes: outcomeText });
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 pb-24 pt-6">
      {/* ---- Header ---- */}
      <div>
        <h1 className="text-xl font-bold">Interventions</h1>
        <p className="text-muted-foreground text-sm">
          Track what you try and what works
        </p>
      </div>

      {/* ---- Log Form ---- */}
      <div className="bg-card space-y-4 rounded-2xl border p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Log Intervention
        </h2>

        {/* Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Date
          </label>
          <input
            type="date"
            value={date}
            max={toDateStr(new Date())}
            onChange={(e) => setDate(e.target.value)}
            className="bg-secondary/50 border-border w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Type grid */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Type</p>
          <div className="grid grid-cols-2 gap-2">
            {INTERVENTION_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() =>
                  setSelectedType(
                    selectedType === t.key ? null : t.key,
                  )
                }
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                  selectedType === t.key
                    ? "border-primary/50 bg-primary/20 text-primary"
                    : "border-transparent bg-secondary/50 text-muted-foreground hover:bg-secondary",
                )}
              >
                <span className="text-base">{t.emoji}</span>
                <span className="font-medium text-xs">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Description (optional)
          </label>
          <textarea
            rows={2}
            placeholder="e.g. 10 min ice bath after long run..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-secondary/50 border-border w-full rounded-xl border p-2.5 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={createMutation.isPending || !selectedType}
        >
          {createMutation.isPending ? "Saving…" : "Log Intervention"}
        </Button>
      </div>

      {/* ---- History ---- */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </h2>

        {listQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card h-20 animate-pulse rounded-xl border"
              />
            ))}
          </div>
        ) : !listQuery.data?.length ? (
          <div className="bg-card rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">
              No interventions logged yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {listQuery.data.map((item) => {
              const typeInfo = getTypeInfo(item.type);
              const isEditingThis = editingOutcome === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-card rounded-2xl border p-4 space-y-3"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{typeInfo.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold">
                          {typeInfo.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(item.date)}
                        </p>
                      </div>
                    </div>

                    {/* Delete */}
                    {deleteConfirm === item.id ? (
                      <div className="flex gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => deleteMutation.mutate({ id: item.id })}
                          disabled={deleteMutation.isPending}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-red-400"
                        onClick={() => setDeleteConfirm(item.id)}
                      >
                        🗑
                      </Button>
                    )}
                  </div>

                  {/* Description */}
                  {item.description && (
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}

                  {/* Effectiveness stars */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground mr-1">
                      Effectiveness:
                    </span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleRating(item.id, star)}
                        className={cn(
                          "text-lg transition-opacity",
                          (item.effectivenessRating ?? 0) >= star
                            ? "opacity-100"
                            : "opacity-30 hover:opacity-60",
                        )}
                      >
                        ⭐
                      </button>
                    ))}
                    {item.effectivenessRating && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {item.effectivenessRating}/5
                      </span>
                    )}
                  </div>

                  {/* Outcome notes */}
                  {isEditingThis ? (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        autoFocus
                        value={outcomeText}
                        onChange={(e) => setOutcomeText(e.target.value)}
                        placeholder="Did it help? What changed?"
                        className="bg-secondary/50 border-border w-full rounded-xl border p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs"
                          onClick={() => saveOutcome(item.id)}
                          disabled={updateMutation.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditingOutcome(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        startOutcomeEdit(item.id, item.outcomeNotes ?? null)
                      }
                      className="w-full text-left"
                    >
                      {item.outcomeNotes ? (
                        <p className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2">
                          {item.outcomeNotes}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/50 italic">
                          + Add outcome notes
                        </p>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
