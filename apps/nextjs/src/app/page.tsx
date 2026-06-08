import { Suspense } from "react";

import { getSession } from "~/auth/server";
import { env } from "~/env";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AuthShowcase } from "./_components/auth-showcase";
import { DashboardHome } from "./_components/dashboard-home";

const DEV_USER_ID = "seed-user-001";

export default async function HomePage() {
  const session = await getSession();

  // In development, or whenever the explicit DEV_BYPASS_AUTH opt-in is set
  // (the HA add-on's single-user mode behind ingress), fall back to the seed
  // user so the app is usable without OAuth. Real auth is required otherwise.
  const devFallbackAllowed =
    env.NODE_ENV === "development" || env.DEV_BYPASS_AUTH === "true";
  const userId = session?.user.id ?? (devFallbackAllowed ? DEV_USER_ID : null);

  if (!userId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-4">
        <AuthShowcase />
      </main>
    );
  }

  prefetch(trpc.readiness.getToday.queryOptions());
  prefetch(trpc.workout.getToday.queryOptions());
  prefetch(trpc.coach.getDailyRecommendation.queryOptions({ userId }));

  return (
    <HydrateClient>
      <main className="mx-auto max-w-lg px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="bg-muted h-8 w-48 animate-pulse rounded" />
              <div className="bg-muted h-40 animate-pulse rounded-2xl" />
              <div className="bg-muted h-32 animate-pulse rounded-2xl" />
            </div>
          }
        >
          <DashboardHome userId={userId} />
        </Suspense>
      </main>
    </HydrateClient>
  );
}
