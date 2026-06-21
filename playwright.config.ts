import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const devServerPort = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 12_000
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }]
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: `npm run dev -- -H 127.0.0.1 -p ${devServerPort}`,
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_EVENT_SLUG: process.env.NEXT_PUBLIC_EVENT_SLUG || "megathon",
      VOTA_DATA_BACKEND: "supabase",
      VOTA_DISABLE_AUTO_SEED: "1",
      PLAYWRIGHT_BASE_URL: baseURL,
      NEXT_PUBLIC_BASE_URL: baseURL,
      NEXT_PUBLIC_QR_BASE_URL: baseURL,
      MOLLIE_API_KEY: "",
      MOLLIE_READINESS_PAYMENT_ID: ""
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] }
    }
  ]
});
