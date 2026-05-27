import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @acme/nextjs exec -- next dev --hostname 127.0.0.1",
    env: {
      AUTH_DISCORD_ID: "ci-placeholder",
      AUTH_DISCORD_SECRET: "ci-placeholder",
      AUTH_SECRET: "ci-secret",
      DEV_BYPASS_AUTH: "true",
      NODE_ENV: "development",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        process.env.POSTGRES_URL ??
        "postgresql://postgres:postgres@localhost:5432/pulsecoach_e2e",
      POSTGRES_URL:
        process.env.POSTGRES_URL ??
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/pulsecoach_e2e",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://localhost:3000",
  },
});
