import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type JoinedUser = {
  context: BrowserContext;
  page: Page;
};

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

const localEnv = readEnvFile(path.join(process.cwd(), ".env.local"));
const adminPassword = process.env.ADMIN_PASSWORD || localEnv.ADMIN_PASSWORD || "local-admin-password";
const megathonWinnerMarketId = "00000000-0000-4000-8000-000000001001";
const dataBackend = process.env.VOTA_DATA_BACKEND || "supabase";

function seedFreshRooms() {
  const result = spawnSync(process.execPath, ["-r", "./tests/register-ts.cjs", "scripts/seed-e2e.ts"], {
    cwd: process.cwd(),
    env: {
      ...localEnv,
      ...process.env,
      NEXT_PUBLIC_EVENT_SLUG: "megathon",
      VOTA_DATA_BACKEND: dataBackend,
      VOTA_DISABLE_AUTO_SEED: "1",
      MOLLIE_API_KEY: "",
      MOLLIE_READINESS_PAYMENT_ID: ""
    },
    stdio: "inherit"
  });
  expect(result.status).toBe(0);
}

function emailForName(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}@e2e.test`;
}

async function joinRoom(browser: Browser, roomSlug: string, name: string, email = emailForName(name)): Promise<JoinedUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/join/${roomSlug}`);
  await expect(page.getByLabel("Role")).toHaveCount(0);
  await page.getByLabel("Stage name").fill(name);
  await expect(page.getByRole("button", { name: "Enter the markets" })).toBeDisabled();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enter the markets" }).click();
  await expect(page).toHaveURL(/\/m\/|\/e\//);
  await expect(page.getByText(name).or(page.getByText(/Prediction|Live room/))).toBeVisible();
  return { context, page };
}

async function expectDuplicateNameBlocked(browser: Browser, roomSlug: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/join/${roomSlug}`);
  await page.getByLabel("Stage name").fill(name);
  await page.getByLabel("Email").fill(`duplicate.${emailForName(name)}`);
  await page.getByRole("button", { name: "Enter the markets" }).click();
  await expect(page.getByText(/stage name is already taken/i)).toBeVisible();
  await context.close();
}

async function pickOutcome(page: Page, outcomeLabel: string, amount = 100) {
  await page.getByRole("button", { name: new RegExp(outcomeLabel) }).first().click();
  if (amount !== 100) {
    const custom = page.getByLabel("Custom MegaBucks").first();
    if (await custom.isVisible()) await custom.fill(String(amount));
  }
  await expect(page.getByRole("button", { name: new RegExp(`Submit ${amount} MBucks|Add ${amount} MBucks|Switch`) })).toBeEnabled();
  await page.getByRole("button", { name: new RegExp(`Submit ${amount} MBucks|Add ${amount} MBucks|Switch`) }).click();
  await expect(page.getByText("Prediction submitted.")).toBeVisible();
}

async function loginAdmin(page: Page, next = "/admin/events/megathon") {
  await page.goto(`/admin/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Weekend password").fill(adminPassword);
  await page.getByRole("button", { name: "Open admin" }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

test.describe("local Supabase live event flows", () => {
  test.beforeEach(() => {
    seedFreshRooms();
  });

  test("multiple people join Megathon, wager, top up, resolve, and get receipts", async ({ browser }) => {
    const orbit = await joinRoom(browser, "megathon", "Orbit Caller");
    const nova = await joinRoom(browser, "megathon", "Nova Caller");
    const talk = await joinRoom(browser, "testingmiki", "Talk Tester");
    await expectDuplicateNameBlocked(browser, "megathon", "Orbit Caller");

    const lockedProfile = await orbit.page.request.patch("/api/session/profile", {
      data: { nickname: "Orbit Edited", email: "orbit.edited@e2e.test" }
    });
    expect(lockedProfile.status()).toBe(409);
    await expect(orbit.page.getByText("Orbit Edited")).toHaveCount(0);

    await expect(orbit.page.getByRole("heading", { name: /Who wins Megathon/ })).toBeVisible();
    await pickOutcome(orbit.page, "Team Orbit");
    await pickOutcome(nova.page, "Team Nova");

    await talk.page.goto("/e/testingmiki");
    await expect(talk.page.getByText("testingmiki").or(talk.page.getByText(/Who wins testingmiki/i))).toBeVisible();
    await talk.page.getByRole("link", { name: /Who wins testingmiki/i }).first().click();
    await pickOutcome(talk.page, "Team Atlas");

    await orbit.page.goto("/e/megathon");
    await orbit.page.getByRole("button", { name: "Add 100 MBucks" }).first().click();
    await expect(orbit.page).toHaveURL(/\/checkout\/test\//);
    await orbit.page.getByRole("button", { name: /Mark test payment paid/ }).click();
    await expect(orbit.page).toHaveURL(/checkout=/);
    await expect(orbit.page.getByText(/\+100 MBucks added|Test checkout completed/)).toBeVisible();

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    admin.on("dialog", (dialog) => dialog.accept());
    await loginAdmin(admin);
    await expect(admin.getByRole("heading", { name: "Megathon" })).toBeVisible();
    await admin.goto(`/admin/markets/${megathonWinnerMarketId}`);
    await admin.getByRole("button", { name: "Lock market" }).click();
    await expect(admin.getByText(/Resolve/)).toBeVisible();
    await admin.getByLabel("Winning outcome").selectOption({ label: "Team Orbit" });
    await admin.getByLabel("Type the winning outcome label").fill("Team Orbit");
    await admin.getByLabel(/I confirm this is the official result/).check();
    await admin.getByRole("button", { name: "Resolve and score" }).click();
    await expect(admin.getByText("This market has already been resolved.")).toBeVisible();

    await orbit.page.goto(`/m/${megathonWinnerMarketId}`);
    await expect(orbit.page.getByRole("link", { name: /Share your receipt/ })).toBeVisible();
    await orbit.page.getByRole("link", { name: /Share your receipt/ }).click();
    await expect(orbit.page.getByRole("heading", { name: /Orbit Caller called Team Orbit/ })).toBeVisible();

    await nova.page.goto(`/m/${megathonWinnerMarketId}`);
    await expect(nova.page.getByText(/did not match the result|This prediction did not match/)).toBeVisible();

    await orbit.context.close();
    await nova.context.close();
    await talk.context.close();
    await adminContext.close();
  });

  test("admin event scoping, stage modes, pause, and public mobile journey stay isolated", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    admin.on("dialog", (dialog) => dialog.accept());
    await loginAdmin(admin, "/admin/events/testingmiki");

    await expect(admin.getByRole("heading", { name: "testingmiki" })).toBeVisible();
    await admin.getByRole("link", { name: "Payments" }).click();
    await expect(admin).toHaveURL(/\/admin\/payments\?eventSlug=testingmiki/);
    await expect(admin.getByText("Operating on event")).toBeVisible();
    await expect(admin.getByRole("heading", { name: "testingmiki" })).toBeVisible();

    await admin.goto("/admin/stage?eventSlug=testingmiki");
    await admin.getByLabel("Stage mode").selectOption("leaderboard");
    await admin.getByRole("button", { name: "Update stage" }).click();
    await expect(admin).toHaveURL(/\/admin\/stage\?eventSlug=testingmiki/);

    await admin.goto("/stage/testingmiki");
    await expect(admin.getByText("Top Oracles").or(admin.getByText("No scored entries yet."))).toBeVisible();

    await admin.goto("/admin/stage?eventSlug=testingmiki");
    await admin.getByLabel("Stage mode").selectOption("live");
    await admin.getByLabel("Emergency pause sensitive user actions").check();
    await admin.getByRole("button", { name: "Update stage" }).click();

    const participant = await joinRoom(browser, "testingmiki", "Paused Player");
    await participant.page.goto("/e/testingmiki");
    await expect(participant.page.getByText("Predictions are paused")).toBeVisible();

    await admin.goto("/admin/stage?eventSlug=testingmiki");
    await admin.getByLabel("Emergency pause sensitive user actions").uncheck();
    await admin.getByRole("button", { name: "Update stage" }).click();
    await participant.page.reload();
    await expect(participant.page.getByText("Predictions are paused")).toHaveCount(0);

    await participant.context.close();
    await adminContext.close();
  });
});
