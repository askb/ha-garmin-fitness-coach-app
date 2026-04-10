"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "../_components/bottom-nav";

const HEALTH_CONDITIONS = [
  { id: "asthma", label: "🫁 Asthma" },
  { id: "hypertension", label: "❤️‍🩹 High Blood Pressure" },
  { id: "diabetes_t1", label: "💉 Type 1 Diabetes" },
  { id: "diabetes_t2", label: "🩺 Type 2 Diabetes" },
  { id: "heart_condition", label: "🫀 Heart Condition" },
  { id: "joint_issues", label: "🦴 Joint Problems" },
  { id: "back_issues", label: "🔙 Back Problems" },
  { id: "respiratory", label: "😮‍💨 Respiratory Issues" },
  { id: "thyroid", label: "🦋 Thyroid Disorder" },
  { id: "anxiety_depression", label: "🧠 Anxiety/Depression" },
];

const BODY_PARTS = [
  "knee", "ankle", "hip", "shoulder", "lower_back", "upper_back",
  "wrist", "elbow", "neck", "foot", "shin", "hamstring", "calf", "quad",
];

function ProfileEditor() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery(trpc.profile.get.queryOptions());

  const [editing, setEditing] = useState(false);
  const [age, setAge] = useState("");
  const [massKg, setMassKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [sex, setSex] = useState<string>("male");

  useEffect(() => {
    if (profile) {
      setAge(profile.age?.toString() ?? "");
      setMassKg(profile.massKg?.toString() ?? "");
      setHeightCm(profile.heightCm?.toString() ?? "");
      setSex(profile.sex ?? "male");
    }
  }, [profile]);

  const upsertProfile = useMutation(
    trpc.profile.upsert.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.profile.get.queryKey() });
        setEditing(false);
      },
    }),
  );

  if (isLoading) {
    return (
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Athlete Profile
        </h2>
        <p className="text-muted-foreground text-sm">Loading profile…</p>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
            Athlete Profile
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Age:</span>{" "}
            {profile?.age ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Sex:</span>{" "}
            <span className="capitalize">{profile?.sex ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Weight:</span>{" "}
            {profile?.massKg ? `${profile.massKg} kg` : "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Height:</span>{" "}
            {profile?.heightCm ? `${profile.heightCm} cm` : "—"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card space-y-3 rounded-2xl border p-4">
      <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
        Athlete Profile
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Age</Label>
          <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div>
          <Label>Sex</Label>
          <div className="flex gap-1">
            {(["male", "female", "other"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSex(s)}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1.5 text-xs capitalize",
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
          <Input type="number" value={massKg} onChange={(e) => setMassKg(e.target.value)} />
        </div>
        <div>
          <Label>Height (cm)</Label>
          <Input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={upsertProfile.isPending}
          onClick={() =>
            upsertProfile.mutate({
              userId: "current-user",
              age: age ? parseInt(age) : null,
              sex: sex as "male" | "female" | "other",
              massKg: massKg ? parseFloat(massKg) : null,
              heightCm: heightCm ? parseFloat(heightCm) : null,
            })
          }
        >
          {upsertProfile.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function HealthProfile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery(trpc.profile.get.queryOptions());

  const [editing, setEditing] = useState(false);
  const [conditions, setConditions] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<{ bodyPart: string; severity: "mild" | "moderate" | "severe" }[]>([]);
  const [medications, setMedications] = useState("");
  const [allergies, setAllergies] = useState("");

  useEffect(() => {
    if (profile) {
      setConditions((profile.healthConditions as string[]) ?? []);
      setInjuries(
        (profile.currentInjuries as { bodyPart: string; severity: "mild" | "moderate" | "severe" }[]) ?? [],
      );
      setMedications((profile.medications as string) ?? "");
      setAllergies((profile.allergies as string) ?? "");
    }
  }, [profile]);

  const updateHealth = useMutation(
    trpc.profile.updateHealth.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.profile.get.queryKey() });
        setEditing(false);
      },
    }),
  );

  if (isLoading) return null;

  const hasAny =
    conditions.length > 0 ||
    injuries.length > 0 ||
    medications ||
    allergies;

  if (!editing) {
    return (
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
            Health & Safety
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {hasAny ? "Edit" : "Add"}
          </Button>
        </div>
        {hasAny ? (
          <div className="space-y-2 text-sm">
            {conditions.length > 0 && (
              <p>
                <span className="text-muted-foreground">Conditions:</span>{" "}
                {conditions
                  .map((c) => HEALTH_CONDITIONS.find((h) => h.id === c)?.label ?? c)
                  .join(", ")}
              </p>
            )}
            {injuries.length > 0 && (
              <p>
                <span className="text-muted-foreground">Injuries:</span>{" "}
                {injuries
                  .map((i) => `${i.bodyPart.replace("_", " ")} (${i.severity})`)
                  .join(", ")}
              </p>
            )}
            {medications && (
              <p>
                <span className="text-muted-foreground">Medications:</span>{" "}
                {medications}
              </p>
            )}
            {allergies && (
              <p>
                <span className="text-muted-foreground">Allergies:</span>{" "}
                {allergies}
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            No health information set. Add conditions, injuries, or medications
            to help the AI coach tailor safe recommendations.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card space-y-4 rounded-2xl border p-4">
      <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
        Health & Safety
      </h2>

      {/* Conditions */}
      <div>
        <Label className="text-sm font-medium">Health conditions</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {HEALTH_CONDITIONS.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setConditions((prev) =>
                  prev.includes(c.id)
                    ? prev.filter((x) => x !== c.id)
                    : [...prev, c.id],
                )
              }
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                conditions.includes(c.id)
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:border-foreground/30",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Injuries */}
      <div>
        <Label className="text-sm font-medium">Current injuries</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {BODY_PARTS.map((part) => {
            const existing = injuries.find((i) => i.bodyPart === part);
            return (
              <button
                key={part}
                onClick={() =>
                  setInjuries((prev) =>
                    existing
                      ? prev.filter((i) => i.bodyPart !== part)
                      : [...prev, { bodyPart: part, severity: "mild" as const }],
                  )
                }
                className={cn(
                  "rounded-full border px-2 py-1 text-xs capitalize transition-colors",
                  existing
                    ? "border-amber-500 bg-amber-500/10 text-amber-600 font-medium"
                    : "text-muted-foreground hover:border-foreground/30",
                )}
              >
                {part.replace("_", " ")}
              </button>
            );
          })}
        </div>
        {injuries.length > 0 && (
          <div className="mt-2 space-y-1">
            {injuries.map((injury) => (
              <div key={injury.bodyPart} className="flex items-center gap-2 text-xs">
                <span className="min-w-[70px] capitalize font-medium">
                  {injury.bodyPart.replace("_", " ")}:
                </span>
                {(["mild", "moderate", "severe"] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() =>
                      setInjuries((prev) =>
                        prev.map((i) =>
                          i.bodyPart === injury.bodyPart ? { ...i, severity: sev } : i,
                        ),
                      )
                    }
                    className={cn(
                      "rounded border px-2 py-0.5 capitalize",
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
        <Label>Medications</Label>
        <Input
          value={medications}
          onChange={(e) => setMedications(e.target.value)}
          placeholder="e.g., Beta-blockers, Metformin…"
        />
      </div>

      {/* Allergies */}
      <div>
        <Label>Allergies or sensitivities</Label>
        <Input
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          placeholder="e.g., Pollen, lactose…"
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={updateHealth.isPending}
          onClick={() =>
            updateHealth.mutate({
              healthConditions: conditions,
              currentInjuries: injuries,
              medications: medications || undefined,
              allergies: allergies || undefined,
            })
          }
        >
          {updateHealth.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>

      <p className="text-muted-foreground text-xs italic">
        💡 All health info is stored locally and used only for safe AI coaching.
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-400">
        ⚠️ Not a substitute for professional medical advice. Consult a qualified
        healthcare professional for personalized guidance.
      </p>
    </div>
  );
}

interface GarminStatus {
  connected: boolean;
  email: string;
  lastSync: string;
}

interface AuthResponse {
  success: boolean;
  needsMfa?: boolean;
  message?: string;
}

function GarminConnection() {
  const [status, setStatus] = useState<GarminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [debugUrl, setDebugUrl] = useState("");

  // Inline ingress detection — no external deps
  const apiUrl = useCallback((path: string) => {
    if (typeof window === "undefined") return path;
    const match = window.location.pathname.match(
      /^(\/api\/hassio_ingress\/[^/]+)/,
    );
    return match ? match[1] + path : path;
  }, []);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showMfa, setShowMfa] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    syncing: boolean;
    phase: string;
    detail: string;
    progress: number;
  } | null>(null);
  const [triggeringSyncState, setTriggeringSyncState] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const url = apiUrl("/api/garmin/auth");
      setDebugUrl(url);
      console.log("[GarminAuth] fetching:", url);
      const res = await fetch(url);
      const data = (await res.json()) as GarminStatus;
      setStatus(data);
    } catch (e) {
      console.error("[GarminAuth] fetch error:", e);
      setStatus({ connected: false, email: "", lastSync: "" });
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Poll sync status when connected
  useEffect(() => {
    if (!status?.connected) return;

    const fetchSyncStatus = async () => {
      try {
        const res = await fetch(apiUrl("/api/garmin/sync"));
        const data = await res.json() as {
          syncing: boolean;
          phase: string;
          detail: string;
          progress: number;
        };
        setSyncStatus(data);
      } catch {
        setSyncStatus(null);
      }
    };

    void fetchSyncStatus();
    // Poll every 3s while syncing, 30s otherwise
    const interval = setInterval(() => {
      void fetchSyncStatus();
    }, syncStatus?.syncing ? 3000 : 30000);

    return () => clearInterval(interval);
  }, [status?.connected, apiUrl, syncStatus?.syncing]);

  const handleSyncNow = async () => {
    setTriggeringSyncState(true);
    try {
      const res = await fetch(apiUrl("/api/garmin/sync"), { method: "POST" });
      const data = await res.json() as { success: boolean; message?: string };
      if (!data.success) {
        setError(data.message ?? "Failed to start sync");
      }
    } catch {
      setError("Failed to trigger sync");
    } finally {
      setTriggeringSyncState(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(apiUrl("/api/garmin/auth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as AuthResponse;

      if (data.success) {
        setEmail("");
        setPassword("");
        await fetchStatus();
      } else if (data.needsMfa) {
        setShowMfa(true);
      } else {
        setError(data.message ?? "Login failed");
      }
    } catch {
      setError("Connection error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(apiUrl("/api/garmin/auth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mfaCode }),
      });
      const data = (await res.json()) as AuthResponse;

      if (data.success) {
        setShowMfa(false);
        setMfaCode("");
        setEmail("");
        setPassword("");
        await fetchStatus();
      } else {
        setError(data.message ?? "MFA verification failed");
      }
    } catch {
      setError("Connection error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    setSubmitting(true);
    setError("");
    try {
      await fetch(apiUrl("/api/garmin/auth"), { method: "DELETE" });
      await fetchStatus();
    } catch {
      setError("Failed to disconnect");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Garmin Connection
        </h2>
        <p className="text-muted-foreground text-sm">Checking connection… {debugUrl && `(${debugUrl})`}</p>
      </div>
    );
  }

  // Connected state
  if (status?.connected) {
    return (
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Garmin Connection
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
            <span className="text-lg">⌚</span>
          </div>
          <div>
            <p className="text-sm font-medium">Garmin Connect</p>
            <p className="text-muted-foreground text-xs">
              Connected{status.email ? ` · ${status.email}` : ""}
            </p>
            {status.lastSync && (
              <p className="text-muted-foreground text-xs">
                Last sync: {new Date(status.lastSync).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        {/* Sync status and trigger */}
        {syncStatus?.syncing ? (
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium text-primary">Syncing...</span>
            </div>
            <p className="text-muted-foreground text-xs">
              {syncStatus.detail || syncStatus.phase}
            </p>
            <div className="bg-muted h-1.5 w-full rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${syncStatus.progress}%` }}
              />
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncNow}
            disabled={triggeringSyncState}
            className="mt-2"
          >
            {triggeringSyncState ? "Starting..." : "🔄 Sync Now"}
          </Button>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDisconnect}
          disabled={submitting}
        >
          {submitting ? "Disconnecting…" : "Disconnect"}
        </Button>
      </div>
    );
  }

  // MFA step
  if (showMfa) {
    return (
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Garmin Connection
        </h2>
        <p className="text-sm">
          A verification code was sent to your device. Enter it below.
        </p>
        <form onSubmit={handleMfa} className="space-y-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="MFA Code"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm"
            required
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Verifying…" : "Verify"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowMfa(false);
                setMfaCode("");
                setError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // Disconnected — login form
  return (
    <div className="bg-card space-y-3 rounded-2xl border p-4">
      <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
        Garmin Connection
      </h2>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
          <span className="text-lg">⌚</span>
        </div>
        <div>
          <p className="text-sm font-medium">Garmin Connect</p>
          <p className="text-muted-foreground text-xs">Not connected</p>
        </div>
      </div>
      <form onSubmit={handleLogin} className="space-y-3">
        <input
          type="email"
          placeholder="Garmin Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm"
          required
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Connecting…" : "Connect"}
        </Button>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Athlete Profile */}
      <ProfileEditor />

      {/* Health & Safety */}
      <HealthProfile />

      {/* Garmin Connection — must work for data sync */}
      <GarminConnection />

      {/* Data & Privacy */}
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Data & Privacy
        </h2>
        <p className="text-muted-foreground text-xs">
          Your Garmin data is stored securely and used only to compute your
          readiness score and workout recommendations. We never share your data.
        </p>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>⚠️ Medical Disclaimer:</strong> PulseCoach provides
            AI-generated fitness guidance and is not a substitute for professional
            medical advice, diagnosis, or treatment. Always consult a qualified
            healthcare professional before starting or modifying any exercise
            program. Individual results may vary.
          </p>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
