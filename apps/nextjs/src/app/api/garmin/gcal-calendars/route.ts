import { requireSession } from "~/auth/guard";
import { gcalForward } from "../_lib/gcal-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  return gcalForward("/auth/gcal-calendars", { method: "GET" });
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const body = await req.text();
  return gcalForward("/auth/gcal-calendars", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
