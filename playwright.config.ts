import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function readEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return {};
  const env: Record<string, string> = {};
  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator);
    let value = trimmed.slice(separator + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const devServerPort = new URL(baseURL).port || "3000";
const localEnv = readEnvFile(path.join(process.cwd(), ".env.local"));

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
      ...localEnv,
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
