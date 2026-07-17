// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useState } from "react";

const ACK_KEY = "pulsecoach.stressBoard.thirdPartyConsent.v1";

/**
 * First-run disclosure for the Stress Board.
 *
 * The board scores *other people* by their effect on your heart rate — that is
 * personal data about non-consenting third parties (privacy §3). Before the
 * user works with it we disclose what it involves and their responsibility, and
 * require an explicit acknowledgement (persisted locally). Names are masked by
 * default regardless; this is the informed-use gate the privacy policy promises.
 */
export function StressBoardConsent() {
  // null = not yet read from storage (avoids an SSR/first-paint flash).
  const [ack, setAck] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setAck(localStorage.getItem(ACK_KEY) === "1");
    } catch {
      // Storage unavailable (private mode / TWA edge) — show the notice.
      setAck(false);
    }
  }, []);

  if (ack === null || ack) return null;

  const acknowledge = () => {
    try {
      localStorage.setItem(ACK_KEY, "1");
    } catch {
      /* best-effort; still dismiss for this session */
    }
    setAck(true);
  };

  return (
    <div
      role="region"
      aria-label="Third-party data notice"
      className="mb-4 rounded border border-yellow-700 bg-yellow-950/40 p-3 text-xs text-yellow-100"
    >
      <p className="font-bold">Before you use the Stress Board</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-yellow-200/90">
        <li>
          This board involves data about <strong>other people</strong>{" "}
          (coworkers, family) — how they affect <em>your</em> heart rate.
        </li>
        <li>
          Names are <strong>masked by default</strong>. Real names stay on your
          own instance and never appear in shared or exported views unless you
          reveal them.
        </li>
        <li>
          You are responsible for collecting and using other people&apos;s data
          lawfully and respectfully.
        </li>
      </ul>
      <button
        onClick={acknowledge}
        className="mt-2 rounded border border-yellow-600 px-3 py-1.5 font-bold text-yellow-100 hover:bg-yellow-900/50"
      >
        I understand
      </button>
    </div>
  );
}
