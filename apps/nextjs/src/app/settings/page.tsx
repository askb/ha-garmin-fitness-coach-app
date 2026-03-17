"use client";

import { useCallback, useEffect, useState } from "react";

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
      </div>

      <BottomNav />
    </main>
  );
}
