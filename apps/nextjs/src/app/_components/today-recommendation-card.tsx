// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { Recommendation, RuleTrace } from "@acme/engine";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

type RecommendationPayload = {
  recommendation: Recommendation;
  auditId: string;
} | null;

interface TodayRecommendationCardProps {
  userId: string;
  date?: string;
}

const ACTION_LABEL: Record<Recommendation["action"], string> = {
  workout: "Workout",
  rest: "Rest day",
  active_recovery: "Active recovery",
  deload: "Deload",
};

const SEVERITY_STYLE: Record<
  RuleTrace["severity"],
  { label: string; icon: string; className: string }
> = {
  info: {
    label: "Info",
    icon: "ℹ️",
    className:
      "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  warn: {
    label: "Warning",
    icon: "⚠️",
    className:
      "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  },
  block: {
    label: "Block",
    icon: "⛔",
    className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  },
};

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatHeadline(recommendation: Recommendation): string {
  if (recommendation.action !== "workout") {
    return ACTION_LABEL[recommendation.action];
  }

  const workoutType = recommendation.workoutType
    ? titleCase(recommendation.workoutType)
    : ACTION_LABEL[recommendation.action];
  const intensity = recommendation.intensity
    ? titleCase(recommendation.intensity)
    : null;

  if (
    !intensity ||
    workoutType.toLowerCase().includes(intensity.toLowerCase())
  ) {
    return workoutType;
  }

  return `${intensity} ${workoutType.toLowerCase()}`;
}

function formatDuration(durationMin: number | undefined): string {
  if (durationMin == null) return "Today";
  if (durationMin < 60) return `${durationMin} min`;

  const hours = Math.floor(durationMin / 60);
  const minutes = durationMin % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function confidenceLevel(confidence: number): "low" | "medium" | "high" {
  if (confidence < 0.4) return "low";
  if (confidence < 0.7) return "medium";
  return "high";
}

function confidenceClass(level: ReturnType<typeof confidenceLevel>): string {
  if (level === "high") {
    return "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300";
  }
  if (level === "medium") {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
  }
  return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
}

function hardBlockLabel(ruleId: string, rules: RuleTrace[]): string {
  return (
    rules.find((rule) => rule.ruleId === ruleId)?.message ?? titleCase(ruleId)
  );
}

function RecommendationSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading today's recommendation"
      className="bg-card animate-pulse rounded-2xl border p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="bg-muted h-6 w-36 rounded-full" />
        <div className="bg-muted h-6 w-20 rounded-full" />
      </div>
      <div className="bg-muted mt-4 h-5 w-5/6 rounded" />
      <div className="bg-muted mt-2 h-4 w-3/5 rounded" />
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="bg-muted h-9 flex-1 rounded-md" />
        <div className="bg-muted h-9 flex-1 rounded-md" />
        <div className="bg-muted h-9 flex-1 rounded-md" />
      </div>
    </section>
  );
}

export function TodayRecommendationCard({
  userId,
  date,
}: TodayRecommendationCardProps) {
  const trpc = useTRPC();
  const [showAllRules, setShowAllRules] = useState(false);
  const queryInput = date ? { userId, date } : { userId };
  const query = useQuery(
    trpc.coach.getDailyRecommendation.queryOptions(queryInput),
  );

  if (query.isLoading) return <RecommendationSkeleton />;

  if (query.isError) {
    return (
      <section className="bg-card rounded-2xl border p-5 text-center">
        <h2 className="text-lg font-semibold">Recommendation unavailable</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          PulseCoach could not load today&apos;s recommendation. Please try
          again.
        </p>
        <Button
          className="mt-4 w-full sm:w-auto"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </section>
    );
  }

  const data = query.data as RecommendationPayload | undefined;
  const recommendation = data?.recommendation;

  if (!recommendation) {
    return (
      <section className="bg-card rounded-2xl border p-5 text-center">
        <h2 className="text-lg font-semibold">No recommendation for today</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          PulseCoach could not load a recommendation. Try again after sync.
        </p>
        <Button
          className="mt-4 w-full sm:w-auto"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </section>
    );
  }

  const auditId = data?.auditId ?? "";
  const firedRules = recommendation.rules.filter((rule) => rule.fired);
  const visibleRules = showAllRules ? recommendation.rules : firedRules;
  const confidence = confidenceLevel(recommendation.confidence);

  function handleAction(action: "accept" | "skip" | "defer") {
    // TODO(v0.17.0 W2.3): wire accept/skip/defer to coach.{accept,skip,defer} mutations.
    console.log(`[v0.17.0-w1.4] ${action}`, { auditId, userId, date });
    toast.success(`Recommendation ${action} recorded locally`);
  }

  return (
    <section className="bg-card rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-semibold">
              {formatHeadline(recommendation)}
            </span>
            <span className="text-muted-foreground text-xs font-medium tabular-nums">
              {formatDuration(recommendation.durationMin)}
            </span>
          </div>
          <h2 className="mt-3 text-xl leading-tight font-semibold">
            {recommendation.reason}
          </h2>
        </div>
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold capitalize",
            confidenceClass(confidence),
          )}
          aria-label={`Confidence ${confidence}, ${Math.round(
            recommendation.confidence * 100,
          )} percent`}
        >
          {confidence} confidence
        </span>
      </div>

      {recommendation.hardBlocks.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Hard blocks">
          {recommendation.hardBlocks.map((ruleId) => (
            <span
              key={ruleId}
              className="inline-flex items-center gap-1 rounded-full border border-red-500/50 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300"
            >
              <span aria-hidden="true">⛔</span>
              {hardBlockLabel(ruleId, recommendation.rules)}
            </span>
          ))}
        </div>
      )}

      <details className="mt-4 rounded-xl border p-3">
        <summary className="focus-visible:ring-ring cursor-pointer text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none">
          Why
        </summary>
        <div className="mt-3 space-y-2">
          {visibleRules.length > 0 ? (
            visibleRules.map((rule) => {
              const style = SEVERITY_STYLE[rule.severity];
              return (
                <div
                  key={rule.ruleId}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    style.className,
                  )}
                >
                  <span className="mr-2" aria-hidden="true">
                    {style.icon}
                  </span>
                  <span className="font-semibold">{style.label}:</span>{" "}
                  <span>{rule.message}</span>
                </div>
              );
            })
          ) : (
            <p className="text-muted-foreground text-sm">
              No rules fired today.
            </p>
          )}

          {!showAllRules && recommendation.rules.length > firedRules.length && (
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs"
              onClick={() => setShowAllRules(true)}
            >
              Show all rules considered
            </Button>
          )}
        </div>
      </details>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="w-full bg-green-600 text-white hover:bg-green-500"
          onClick={() => handleAction("accept")}
        >
          Accept
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => handleAction("skip")}
        >
          Skip
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleAction("defer")}
        >
          Defer
        </Button>
      </div>
    </section>
  );
}
