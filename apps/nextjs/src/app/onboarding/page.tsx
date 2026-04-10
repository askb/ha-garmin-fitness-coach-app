"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";

import { useTRPC } from "~/trpc/react";

const HEALTH_CONDITIONS = [
  { id: "asthma", label: "🫁 Asthma", desc: "Exercise-induced or chronic" },
  {
    id: "hypertension",
    label: "❤️‍🩹 High Blood Pressure",
    desc: "Managed or unmanaged",
  },
  { id: "diabetes_t1", label: "💉 Type 1 Diabetes", desc: "Insulin-dependent" },
  {
    id: "diabetes_t2",
    label: "🩺 Type 2 Diabetes",
    desc: "Diet/medication managed",
  },
  {
    id: "heart_condition",
    label: "🫀 Heart Condition",
    desc: "Arrhythmia, murmur, etc.",
  },
  {
    id: "joint_issues",
    label: "🦴 Joint Problems",
    desc: "Arthritis, chronic pain",
  },
  {
    id: "back_issues",
    label: "🔙 Back Problems",
    desc: "Herniation, chronic pain",
  },
  {
    id: "respiratory",
    label: "😮‍💨 Respiratory Issues",
    desc: "COPD, sleep apnea",
  },
  { id: "thyroid", label: "🦋 Thyroid Disorder", desc: "Hypo/hyperthyroidism" },
  {
    id: "anxiety_depression",
    label: "🧠 Anxiety/Depression",
    desc: "Affects training motivation",
  },
];

const BODY_PARTS = [
  "knee",
  "ankle",
  "hip",
  "shoulder",
  "lower_back",
  "upper_back",
  "wrist",
  "elbow",
  "neck",
  "foot",
  "shin",
  "hamstring",
  "calf",
  "quad",
];

const SPORTS = ["running", "cycling", "strength", "swimming", "team_sport"];
const GOALS = [
  "maintain",
  "performance",
  "body_composition",
  "return_from_injury",
];
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
  const [weeklyDays, setWeeklyDays] = useState<string[]>([
    "mon",
    "wed",
    "fri",
    "sat",
  ]);
  const [minutesPerDay, setMinutesPerDay] = useState(45);
  const [healthConditions, setHealthConditions] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<
    {
      bodyPart: string;
      severity: "mild" | "moderate" | "severe";
      since?: string;
      notes?: string;
    }[]
  >([]);
  const [medications, setMedications] = useState("");
  const [allergies, setAllergies] = useState("");

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
      healthConditions,
      currentInjuries: injuries,
      medications: medications || undefined,
      allergies: allergies || undefined,
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
      <p className="text-muted-foreground text-sm">Which days can you train?</p>
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

    // Step 3: Health & Safety
    <div key="health" className="space-y-4">
      <h2 className="text-xl font-bold">Health & Safety</h2>
      <p className="text-muted-foreground text-sm">
        Optional — helps us tailor safe recommendations for your body.
      </p>

      {/* Health conditions */}
      <div>
        <Label className="text-sm font-medium">Any health conditions?</Label>
        <div className="mt-2 grid grid-cols-1 gap-2">
          {HEALTH_CONDITIONS.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setHealthConditions((prev) =>
                  prev.includes(c.id)
                    ? prev.filter((x) => x !== c.id)
                    : [...prev, c.id],
                )
              }
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                healthConditions.includes(c.id)
                  ? "border-primary bg-primary/5"
                  : "hover:border-foreground/20",
              )}
            >
              <span className="text-lg leading-none">
                {c.label.split(" ")[0]}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {c.label.split(" ").slice(1).join(" ")}
                </p>
                <p className="text-muted-foreground text-xs">{c.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Current injuries */}
      <div>
        <Label className="text-sm font-medium">Any current injuries?</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {BODY_PARTS.map((part) => {
            const existing = injuries.find((i) => i.bodyPart === part);
            return (
              <button
                key={part}
                onClick={() =>
                  setInjuries((prev) =>
                    existing
                      ? prev.filter((i) => i.bodyPart !== part)
                      : [
                          ...prev,
                          { bodyPart: part, severity: "mild" as const },
                        ],
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs capitalize transition-colors",
                  existing
                    ? "border-amber-500 bg-amber-500/10 font-medium text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground hover:border-foreground/30",
                )}
              >
                {part.replace("_", " ")}
              </button>
            );
          })}
        </div>
        {injuries.length > 0 && (
          <div className="mt-2 space-y-2">
            {injuries.map((injury) => (
              <div
                key={injury.bodyPart}
                className="flex items-center gap-2 text-sm"
              >
                <span className="min-w-[80px] font-medium capitalize">
                  {injury.bodyPart.replace("_", " ")}:
                </span>
                {(["mild", "moderate", "severe"] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() =>
                      setInjuries((prev) =>
                        prev.map((i) =>
                          i.bodyPart === injury.bodyPart
                            ? { ...i, severity: sev }
                            : i,
                        ),
                      )
                    }
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs capitalize",
                      injury.severity === sev
                        ? sev === "mild"
                          ? "border-green-500 bg-green-500/10 text-green-700"
                          : sev === "moderate"
                            ? "border-amber-500 bg-amber-500/10 text-amber-700"
                            : "border-red-500 bg-red-500/10 text-red-700"
                        : "text-muted-foreground",
                    )}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Medications */}
      <div>
        <Label>Current medications</Label>
        <Input
          value={medications}
          onChange={(e) => setMedications(e.target.value)}
          placeholder="e.g., Beta-blockers, Metformin, Inhaler…"
        />
      </div>

      {/* Allergies */}
      <div>
        <Label>Allergies or sensitivities</Label>
        <Input
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          placeholder="e.g., Pollen, lactose intolerant…"
        />
      </div>

      <p className="text-muted-foreground text-xs italic">
        💡 All health information is optional and stored locally. It helps our
        AI avoid unsafe recommendations.
      </p>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>⚠️ Medical Disclaimer:</strong> PulseCoach is not a substitute
          for professional medical advice, diagnosis, or treatment.
          Recommendations are generated by AI and may not account for all
          individual factors. Always consult a qualified healthcare professional
          before starting or modifying any exercise program, especially if you
          have pre-existing health conditions. Individual results may vary.
        </p>
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
