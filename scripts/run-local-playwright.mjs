import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
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

function e2eEnv(overrides = {}) {
  return {
    ...process.env,
    ...readEnvFile(path.join(process.cwd(), ".env.local")),
    NEXT_PUBLIC_EVENT_SLUG: "megathon",
    VOTA_DATA_BACKEND: "supabase",
    VOTA_DISABLE_AUTO_SEED: "1",
    PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3100",
    NEXT_PUBLIC_BASE_URL: "http://127.0.0.1:3100",
    NEXT_PUBLIC_QR_BASE_URL: "http://127.0.0.1:3100",
    MOLLIE_API_KEY: "",
    MOLLIE_READINESS_PAYMENT_ID: "",
    ...overrides
  };
}

function run(command, args, options = {}) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: options.env || process.env,
    shell: process.platform === "win32"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run("supabase", ["start"]);
run("supabase", ["db", "reset"]);
run("node", ["scripts/write-local-supabase-env.mjs"]);
const env = e2eEnv();
run("node", ["-r", "./tests/register-ts.cjs", "scripts/seed-e2e.ts"], { env });
run("npx", ["playwright", "install", "chromium"], { env });
run("npx", ["playwright", "test"], { env });
