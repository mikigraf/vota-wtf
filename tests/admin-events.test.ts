import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { resolveAdminEvent } from "../src/lib/admin-events";
import { createEvent, createSeedStore } from "../src/lib/store";
import { normalizeEventSlug } from "../src/lib/utils";

test("admin-created events get URL-safe unique slugs and audit logs", () => {
  const store = createSeedStore();
  assert.equal(normalizeEventSlug("  Side Stage: Finals!  "), "side-stage-finals");

  const event = createEvent(store, {
    name: "Side Stage Finals",
    slug: "Side Stage: Finals!",
    status: "live",
    starterCredits: 1500,
    auditIp: "127.0.0.1"
  });

  assert.equal(event.slug, "side-stage-finals");
  assert.equal(event.name, "Side Stage Finals");
  assert.equal(event.starterCredits, 1500);
  assert.equal(event.stageMode, "join");
  assert.equal(event.emergencyPaused, false);
  assert.equal(store.adminAuditLogs.some((log) => log.action === "create_event" && log.entityId === event.id), true);
  assert.throws(
    () => createEvent(store, { name: "Duplicate side stage", slug: "side-stage-finals" }),
    /already in use/
  );
});

test("admin event selection uses requested events and falls back predictably", () => {
  const store = createSeedStore();

  const selected = resolveAdminEvent(store, "testingmiki");
  assert.equal(selected.event?.slug, "testingmiki");
  assert.equal(selected.requestedSlug, "testingmiki");
  assert.equal(selected.usedFallback, false);

  const missing = resolveAdminEvent(store, "missing-room");
  assert.equal(missing.event?.slug, "megathon");
  assert.equal(missing.requestedSlug, "missing-room");
  assert.equal(missing.usedFallback, true);

  const defaulted = resolveAdminEvent(store);
  assert.equal(defaulted.event?.slug, "megathon");
  assert.equal(defaulted.requestedSlug, "megathon");
  assert.equal(defaulted.usedFallback, false);
});

test("admin pages normalize stale event query params before rendering scoped controls", () => {
  const pagePaths = [
    "app/admin/page.tsx",
    "app/admin/participants/page.tsx",
    "app/admin/audit/page.tsx",
    "app/admin/readiness/page.tsx",
    "app/admin/report/page.tsx",
    "app/admin/payments/page.tsx",
    "app/admin/stage/page.tsx",
    "app/admin/agents/page.tsx"
  ];

  for (const path of pagePaths) {
    const source = fs.readFileSync(path, "utf8");
    assert.match(source, /resolveAdminEvent/);
    assert.match(source, /usedFallback/);
    assert.match(source, /Event not found/);
  }

  assert.doesNotMatch(fs.readFileSync("app/admin/stage/page.tsx", "utf8"), /getEventOrThrow/);
  assert.doesNotMatch(fs.readFileSync("app/admin/report/page.tsx", "utf8"), /DEFAULT_EVENT_SLUG/);
  assert.match(fs.readFileSync("components/admin-nav.tsx", "utf8"), /href=\{scopedHref\("\/admin", eventSlug\)\}/);
});

test("admin event detail links recover when a room slug is stale", () => {
  const source = fs.readFileSync("app/admin/events/[slug]/page.tsx", "utf8");
  assert.doesNotMatch(source, /notFound\(\)/);
  assert.match(source, /DEFAULT_EVENT_SLUG/);
  assert.match(source, /Event not found/);
  assert.match(source, /This admin link points to a room that no longer exists/);
  assert.match(source, /ButtonLink href="\/admin\/events"/);
  assert.match(source, /Open \{fallbackEvent\.name\}/);
});

test("admin events page exposes event creation and stage screen links", () => {
  const eventsPage = fs.readFileSync("app/admin/events/page.tsx", "utf8");
  const dashboardPage = fs.readFileSync("app/admin/page.tsx", "utf8");
  const eventDetailPage = fs.readFileSync("app/admin/events/[slug]/page.tsx", "utf8");
  const stageAdminPage = fs.readFileSync("app/admin/stage/page.tsx", "utf8");
  const nav = fs.readFileSync("components/admin-nav.tsx", "utf8");
  const route = fs.readFileSync("app/api/admin/events/route.ts", "utf8");

  assert.match(eventsPage, /action="\/api\/admin\/events"/);
  assert.match(eventsPage, /name="name"/);
  assert.match(eventsPage, /name="slug"/);
  assert.match(eventsPage, /name="starterCredits"/);
  assert.match(eventsPage, /Stage URL/);
  assert.match(eventsPage, /\/stage\/\$\{event\.slug\}/);
  assert.match(dashboardPage, /Stage URL/);
  assert.match(dashboardPage, /\/stage\/\$\{metrics\.event\.slug\}/);
  assert.match(eventDetailPage, /Stage URL/);
  assert.match(eventDetailPage, /\/stage\/\$\{slug\}/);
  assert.match(stageAdminPage, /Stage screen/);
  assert.match(nav, /Stage screen/);
  assert.match(route, /requireAdminRequest/);
  assert.match(route, /createEventData/);
  assert.match(route, /\/admin\/events\/\$\{event\.slug\}/);
});
