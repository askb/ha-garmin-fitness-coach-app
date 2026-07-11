import { requireSession } from "~/auth/guard";
import { authForward } from "../../_lib/gcal-proxy";

export const dynamic = "force-dynamic";

const UNSUPPORTED =
  "Interaction logging not available. Update addon to v0.26.0+";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = await params;
  // The id is a short hex token; encode defensively anyway.
  return authForward(
    `/auth/interactions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    UNSUPPORTED,
  );
}
