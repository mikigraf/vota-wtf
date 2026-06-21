import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createQrCode, createQrMatrix, formatBits } from "../components/qr-code";

test("stage QR renderer creates a deterministic local matrix", () => {
  const first = createQrMatrix("https://vota.wtf/j/megathon-finals");
  const second = createQrMatrix("https://vota.wtf/j/megathon-finals");
  assert.equal(first.length, 41);
  assert.equal(first.every((row) => row.length === 41), true);
  assert.deepEqual(first, second);
  const darkModules = first.flat().filter(Boolean).length;
  assert.ok(darkModules > 300);
  assert.ok(darkModules < 1200);
});

test("stage QR renderer writes format bits at standard QR coordinates", () => {
  const { matrix, mask } = createQrCode("https://vota.wtf/j/megathon-finals");
  const bits = formatBits(mask);
  const bit = (index: number) => ((bits >>> index) & 1) !== 0;
  for (let i = 0; i <= 5; i += 1) assert.equal(matrix[i][8], bit(i));
  assert.equal(matrix[7][8], bit(6));
  assert.equal(matrix[8][8], bit(7));
  assert.equal(matrix[8][7], bit(8));
  for (let i = 9; i < 15; i += 1) assert.equal(matrix[8][14 - i], bit(i));
  for (let i = 0; i < 8; i += 1) assert.equal(matrix[8][40 - i], bit(i));
  for (let i = 8; i < 15; i += 1) assert.equal(matrix[26 + i][8], bit(i));
  assert.equal(matrix[33][8], true);
});

test("stage page uses the compact join alias for deployed QR links", () => {
  const stagePage = fs.readFileSync("app/stage/[eventSlug]/page.tsx", "utf8");
  const joinAlias = fs.readFileSync("app/j/[eventSlug]/page.tsx", "utf8");
  const envExample = fs.readFileSync(".env.example", "utf8");
  assert.match(stagePage, /FINAL_EVENT_SLUG/);
  assert.match(stagePage, /stageJoinUrl\(FINAL_EVENT_SLUG\)/);
  assert.match(stagePage, /Stage room not found/);
  assert.doesNotMatch(stagePage, /loadStageData\(DEFAULT_EVENT_SLUG\)|recoverySlug|activeSlug/);
  assert.match(joinAlias, /redirect\(`\/join\/\$\{eventSlug\}`\)/);
  assert.match(envExample, /^NEXT_PUBLIC_QR_BASE_URL=https:\/\/vota\.wtf$/m);
  assert.doesNotThrow(() => createQrMatrix("https://vota.wtf/j/megathon-finals"));
});
