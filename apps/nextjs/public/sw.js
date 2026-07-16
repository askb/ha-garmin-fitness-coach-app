// SPDX-License-Identifier: Apache-2.0
// @ts-nocheck -- service-worker globals (self.skipWaiting, clients) aren't in the DOM lib
// Minimal service worker: exists only so the site is an installable PWA
// (Bubblewrap/TWA prerequisite). No offline caching — out of MVP scope.
// ponytail: no-op fetch handler, add real caching only if offline is needed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
