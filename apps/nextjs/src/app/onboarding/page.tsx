"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "~/trpc/react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";

import { cn } from "@acme/ui";

const SPORTS = ["running", "cycling", "strength", "swimming", "team_sport"];
const GOALS = ["maintain", "performance", "body_composition", "return_from_injury"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const GOAL_LABELS: Record<string, string> = {
  maintain: "🏃 Maintain Fitness",
  performance: "🏆 Performance",
  body_composition: "💪 Body Composition",
  return_from_injury: "🔄 Return from Layoff",
};

export default function OnboardingPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const [step, setStep] = useState(0);

  // Profile state
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "other">("male");
  const [massKg, setMassKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [goals, setGoals] = useState<{ sport: string; goalType: string }[]>([]);
  const [weeklyDays, setWeeklyDays] = useState<string[]>(["mon", "wed", "fri", "sat"]);
  const [minutesPerDay, setMinutesPerDay] = useState(45);

  const upsertProfile = useMutation(
    trpc.profile.upsert.mutationOptions({
      onSuccess: () => router.push("/"),
    }),
  );

  const toggleSport = (s: string) => {
    setSelectedSports((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const toggleDay = (d: string) => {
    setWeeklyDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const handleFinish = () => {
    upsertProfile.mutate({
      userId: "current-user", // will be overridden by server
      age: age ? parseInt(age) : null,
      sex,
      massKg: massKg ? parseFloat(massKg) : null,
      heightCm: heightCm ? parseFloat(heightCm) : null,
      experienceLevel: "intermediate",
      primarySports: selectedSports,
      goals: selectedSports.map((sport) => ({
        sport,
        goalType: goals.find((g) => g.sport === sport)?.goalType ?? "maintain",
      })),
      weeklyDays,
      minutesPerDay,
    });
  };

  const steps = [
    // Step 0: Profile
    <div key="profile" className="space-y-4">
      <h2 className="text-xl font-bold">About You</h2>
      <p className="text-muted-foreground text-sm">
        Help us personalize your training.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Age</Label>
          <Input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="32"
          />
        </div>
        <div>
          <Label>Sex</Label>
          <div className="flex gap-2">
            {(["male", "female", "other"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSex(s)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm capitalize",
                  sex === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Weight (kg)</Label>
          <Input
            type="number"
            value={massKg}
            onChange={(e) => setMassKg(e.target.value)}
            placeholder="78"
          />
        </div>
        <div>
          <Label>Height (cm)</Label>
          <Input
            type="number"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            placeholder="180"
          />
        </div>
      </div>
    </div>,

    // Step 1: Sports
    <div key="sports" className="space-y-4">
      <h2 className="text-xl font-bold">Your Sports</h2>
      <p className="text-muted-foreground text-sm">
        Select all sports you train.
      </p>
      <div className="flex flex-wrap gap-2">
        {SPORTS.map((sport) => (
          <button
            key={sport}
            onClick={() => toggleSport(sport)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm capitalize transition-colors",
              selectedSports.includes(sport)
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:border-foreground/30",
            )}
          >
            {sport.replace("_", " ")}
          </button>
        ))}
      </div>

      {selectedSports.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium">Goal for each sport:</p>
          {selectedSports.map((sport) => (
            <div key={sport} className="space-y-1">
              <p className="text-muted-foreground text-xs capitalize">
                {sport}
              </p>
              <div className="flex flex-wrap gap-1">
                {GOALS.map((goal) => (
                  <button
                    key={goal}
                    onClick={() =>
                      setGoals((prev) => [
                        ...prev.filter((g) => g.sport !== sport),
                        { sport, goalType: goal },
                      ])
                    }
                    className={cn(
                      "rounded-lg border px-2 py-1 text-xs transition-colors",
                      goals.find(
                        (g) => g.sport === sport && g.goalType === goal,
                      )
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {GOAL_LABELS[goal]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,

    // Step 2: Availability
    <div key="availability" className="space-y-4">
      <h2 className="text-xl font-bold">Weekly Schedule</h2>
      <p className="text-muted-foreground text-sm">
        Which days can you train?
      </p>
      <div className="flex gap-2">
        {DAYS.map((d) => (
          <button
            key={d}
            onClick={() => toggleDay(d)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border text-xs font-medium uppercase transition-colors",
              weeklyDays.includes(d)
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {d.charAt(0).toUpperCase()}
          </button>
        ))}
      </div>
      <div>
        <Label>Minutes per session: {minutesPerDay}</Label>
        <input
          type="range"
          min={15}
          max={120}
          step={5}
          value={minutesPerDay}
          onChange={(e) => setMinutesPerDay(parseInt(e.target.value))}
          className="w-full"
        />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>15 min</span>
          <span>120 min</span>
        </div>
      </div>
    </div>,
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      {/* Progress */}
      <div className="mb-6 flex gap-1">
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i <= step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>

      {steps[step]}

      {/* Navigation */}
      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button className="flex-1" onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button
            className="flex-1"
            onClick={handleFinish}
            disabled={upsertProfile.isPending}
          >
            {upsertProfile.isPending ? "Saving..." : "Let's Go 🚀"}
          </Button>
        )}
      </div>
    </main>
  );
}
