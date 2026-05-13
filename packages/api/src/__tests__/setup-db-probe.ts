/**
 * Vitest setup file: probes Postgres availability once before all tests in
 * this package run. Sets `globalThis.__DB_AVAILABLE__` accordingly so
 * DB-requiring test files can `describe.skipIf(!globalThis.__DB_AVAILABLE__)`
 * instead of failing with `ECONNREFUSED`.
 *
 * Behavior:
 *  - If `DATABASE_URL`/`POSTGRES_URL` is unset → skip DB tests.
 *  - If a TCP handshake to the host:port succeeds → run DB tests.
 *  - If the handshake fails (ECONNREFUSED etc) → skip DB tests, log once.
 *
 * Opt-out: set `SKIP_DB_TESTS=1` to force-skip even when a DB is reachable.
 *
 * Note: We use a raw `net.connect` rather than a full `pg.Client.connect`
 * to avoid adding `pg` to `@acme/api`'s direct dependency list. TCP accept
 * is a sufficient signal — actual SQL errors will surface in the tests
 * themselves if e.g. credentials are wrong.
 */

import net from "node:net";

declare global {
  // eslint-disable-next-line no-var
  var __DB_AVAILABLE__: boolean;
}

function parseHostPort(url: string): { host: string; port: number } | null {
  try {
    const u = new URL(url);
    if (!u.hostname) return null;
    const port = u.port ? Number(u.port) : 5432;
    return { host: u.hostname, port };
  } catch {
    return null;
  }
}

async function probeDb(): Promise<boolean> {
  if (process.env.SKIP_DB_TESTS === "1") return false;
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  if (!url) return false;
  const target = parseHostPort(url);
  if (!target) return false;

  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: target.host, port: target.port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1500);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

globalThis.__DB_AVAILABLE__ = await probeDb();

if (!globalThis.__DB_AVAILABLE__) {
  console.warn(
    "[vitest setup] Postgres not reachable — DB-requiring tests will be skipped.",
  );
}
