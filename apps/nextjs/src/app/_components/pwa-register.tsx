// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect } from "react";

// Registers the minimal service worker so the app is installable as a PWA.
// Silent-fails under HA ingress (non-root base path) — harmless, the SW is
// a no-op. Note: no next-pwa dependency; five lines cover the need.
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore: ingress base path or unsupported context */
      });
    }
  }, []);
  return null;
}
