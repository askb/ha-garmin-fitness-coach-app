import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AuthShowcase } from "./_components/auth-showcase";
import { DashboardHome } from "./_components/dashboard-home";

export default function HomePage() {
  prefetch(trpc.readiness.getToday.queryOptions());
  prefetch(trpc.workout.getToday.queryOptions());

  return (
    <HydrateClient>
      <main className="mx-auto max-w-lg px-4 pt-6 pb-24">
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="bg-muted h-8 w-48 animate-pulse rounded" />
              <div className="bg-muted h-40 animate-pulse rounded-2xl" />
              <div className="bg-muted h-32 animate-pulse rounded-2xl" />
            </div>
          }
        >
          <DashboardHome />
        </Suspense>
      </main>
    </HydrateClient>
  );
}
