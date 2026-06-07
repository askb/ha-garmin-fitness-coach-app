import type { NextRequest } from "next/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter, createTRPCContext } from "@acme/api";

import { auth } from "~/auth/server";

/**
 * Browser origins allowed to make cross-origin tRPC calls. Same-origin
 * requests (the app behind HA ingress / its own domain) never hit CORS, and
 * native/expo clients do not enforce it, so this only needs to cover known web
 * deployment origins. Computed once at module load (env is stable per process).
 */
const ALLOWED_ORIGINS: ReadonlySet<string> = (() => {
  const origins = new Set<string>([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  // eslint-disable-next-line no-restricted-properties
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) origins.add(`https://${vercelUrl}`);
  return origins;
})();

/**
 * Reflect the request Origin only when it is explicitly allow-listed, instead
 * of using a wildcard. A wildcard combined with the dev auth bypass would let
 * any site read authenticated responses cross-origin.
 */
const setCorsHeaders = (req: NextRequest, res: Response) => {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    // Append rather than set so we don't clobber a Vary value set elsewhere.
    res.headers.append("Vary", "Origin");
  }
  res.headers.set("Access-Control-Allow-Methods", "OPTIONS, GET, POST");
  // Include x-trpc-source, which the Next.js tRPC client sends on every
  // request; omitting it makes cross-origin preflight fail for allowed callers.
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-trpc-source",
  );
};

export const OPTIONS = (req: NextRequest) => {
  const response = new Response(null, {
    status: 204,
  });
  setCorsHeaders(req, response);
  return response;
};

const handler = async (req: NextRequest) => {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req,
    createContext: () =>
      createTRPCContext({
        auth: auth,
        headers: req.headers,
      }),
    onError({ error, path }) {
      console.error(`>>> tRPC Error on '${path}'`, error);
    },
  });

  setCorsHeaders(req, response);
  return response;
};

export { handler as GET, handler as POST };
