import { analyticsRouter } from "./router/analytics";
import { authRouter } from "./router/auth";
import { garminRouter } from "./router/garmin";
import { journalRouter } from "./router/journal";
import { postRouter } from "./router/post";
import { profileRouter } from "./router/profile";
import { readinessRouter } from "./router/readiness";
import { sleepRouter } from "./router/sleep";
import { trendsRouter } from "./router/trends";
import { workoutRouter } from "./router/workout";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  analytics: analyticsRouter,
  auth: authRouter,
  garmin: garminRouter,
  journal: journalRouter,
  post: postRouter,
  profile: profileRouter,
  readiness: readinessRouter,
  sleep: sleepRouter,
  workout: workoutRouter,
  trends: trendsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
