import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("public stale links give participants a recovery path", () => {
  const missingLink = fs.readFileSync("components/public-missing-link.tsx", "utf8");
  const joinPage = fs.readFileSync("app/join/[eventSlug]/page.tsx", "utf8");
  const eventPage = fs.readFileSync("app/e/[eventSlug]/page.tsx", "utf8");
  const marketPage = fs.readFileSync("app/m/[marketId]/page.tsx", "utf8");

  assert.match(missingLink, /DEFAULT_EVENT_SLUG/);
  assert.match(missingLink, /Join the live room/);
  assert.match(missingLink, /min-h-\[calc\(100dvh-58px\)\]/);
  assert.match(missingLink, /ButtonLink href=\{href\}/);

  assert.match(joinPage, /<PublicMissingLink/);
  assert.match(joinPage, /title="Room not found"/);
  assert.match(joinPage, /href=\{`\/join\/\$\{DEFAULT_EVENT_SLUG\}`\}/);

  assert.match(eventPage, /<PublicMissingLink/);
  assert.match(eventPage, /title="Room not found"/);
  assert.match(eventPage, /href=\{`\/join\/\$\{DEFAULT_EVENT_SLUG\}`\}/);

  assert.match(marketPage, /<PublicMissingLink/);
  assert.match(marketPage, /title="Prediction not found"/);
  assert.match(marketPage, /action="Back to live room"/);
  assert.match(marketPage, /findMarketEventSlugData\(marketId\)/);
  assert.match(marketPage, /href=\{`\/e\/\$\{recoveryEventSlug \|\| DEFAULT_EVENT_SLUG\}`\}/);
});
