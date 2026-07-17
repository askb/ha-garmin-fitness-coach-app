// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0
import type { MetadataRoute } from "next";

// Native Next metadata route → serves /manifest.webmanifest and auto-injects
// <link rel="manifest">. Makes the app an installable PWA (TWA prerequisite).
// ponytail: name stays "PulseCoach" until G1 clearance; rename here on rebrand.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PulseCoach — Your Personal Training Coach",
    short_name: "PulseCoach",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
