import { authRouter } from "./router/auth";
import { garminRouter } from "./router/garmin";
import { postRouter } from "./router/post";
import { profileRouter } from "./router/profile";
import { readinessRouter } from "./router/readiness";
import { trendsRouter } from "./router/trends";
import { workoutRouter } from "./router/workout";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  garmin: garminRouter,
  post: postRouter,
  profile: profileRouter,
  readiness: readinessRouter,
  workout: workoutRouter,
  trends: trendsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
