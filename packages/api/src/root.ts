import { activityRouter } from "./router/activity";
import { advancedMetricsRouter } from "./router/advanced-metrics";
import { analyticsRouter } from "./router/analytics";
import { authRouter } from "./router/auth";
import { baselinesRouter } from "./router/baselines";
import { chatRouter } from "./router/chat";
import { dataQualityRouter } from "./router/data-quality";
import { garminRouter } from "./router/garmin";
import { interventionRouter } from "./router/intervention";
import { journalRouter } from "./router/journal";
import { postRouter } from "./router/post";
import { proactiveRouter } from "./router/proactive";
import { profileRouter } from "./router/profile";
import { readinessRouter } from "./router/readiness";
import { referenceRouter } from "./router/reference";
import { sessionReportRouter } from "./router/session-report";
import { sleepRouter } from "./router/sleep";
import { trendsRouter } from "./router/trends";
import { workoutRouter } from "./router/workout";
import { zonesRouter } from "./router/zones";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  activity: activityRouter,
  advancedMetrics: advancedMetricsRouter,
  analytics: analyticsRouter,
  auth: authRouter,
  baselines: baselinesRouter,
  chat: chatRouter,
  dataQuality: dataQualityRouter,
  garmin: garminRouter,
  intervention: interventionRouter,
  journal: journalRouter,
  post: postRouter,
  proactive: proactiveRouter,
  profile: profileRouter,
  readiness: readinessRouter,
  reference: referenceRouter,
  sessionReport: sessionReportRouter,
  sleep: sleepRouter,
  workout: workoutRouter,
  trends: trendsRouter,
  zones: zonesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
