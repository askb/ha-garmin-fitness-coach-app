"use client";

import { useCallback, useEffect, useState } from "react";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { BottomNav } from "../_components/bottom-nav";

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

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showMfa, setShowMfa] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/garmin/auth");
      const data = (await res.json()) as GarminStatus;
      setStatus(data);
    } catch {
      setStatus({ connected: false, email: "", lastSync: "" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/garmin/auth", {
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
      const res = await fetch("/api/garmin/auth", {
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
      await fetch("/api/garmin/auth", { method: "DELETE" });
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
        <p className="text-muted-foreground text-sm">Checking connection…</p>
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
  const trpc = useTRPC();
  const profile = useQuery(trpc.profile.get.queryOptions());

  const p = profile.data as Record<string, unknown> | null | undefined;

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Profile
        </h2>
        {p ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Age</span>
              <p className="font-medium">{(p.age as number) ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Sex</span>
              <p className="font-medium capitalize">
                {(p.sex as string) ?? "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Weight</span>
              <p className="font-medium">
                {p.massKg ? `${p.massKg} kg` : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Height</span>
              <p className="font-medium">
                {p.heightCm ? `${p.heightCm} cm` : "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No profile set up.</p>
        )}
        <Button variant="outline" size="sm" asChild>
          <a href="/onboarding">Edit Profile</a>
        </Button>
      </div>

      {/* Sports & Goals */}
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
          Sports & Goals
        </h2>
        {p?.primarySports ? (
          <div className="flex flex-wrap gap-2">
            {(p.primarySports as string[]).map((sport) => (
              <span
                key={sport}
                className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm capitalize"
              >
                {sport}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No sports selected.</p>
        )}
      </div>

      {/* Garmin Connection */}
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Export Data
          </Button>
          <Button variant="outline" size="sm" className="text-red-500">
            Delete Account
          </Button>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
