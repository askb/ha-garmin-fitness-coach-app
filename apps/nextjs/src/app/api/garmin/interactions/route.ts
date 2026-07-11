import { requireSession } from "~/auth/guard";
import { authForward } from "../_lib/gcal-proxy";

export const dynamic = "force-dynamic";

const UNSUPPORTED =
  "Interaction logging not available. Update addon to v0.26.0+";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  return authForward("/auth/interactions", undefined, UNSUPPORTED);
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const body = await req.text();
  return authForward(
    "/auth/interactions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
    UNSUPPORTED,
  );
}
