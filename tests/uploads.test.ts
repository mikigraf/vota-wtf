import assert from "node:assert/strict";
import test from "node:test";
import { assertRequestSize, MAX_MARKET_FORM_BYTES, saveMarketImageFile } from "../src/lib/uploads";

test("market image upload rejects forged image bytes", async () => {
  const forged = new File([Buffer.from("not an image")], "fake.png", { type: "image/png" });
  await assert.rejects(() => saveMarketImageFile("fake", forged), /does not match/);
});

test("admin upload request size is rejected before multipart parsing", () => {
  const request = new Request("https://vota.test/api/admin/markets", {
    method: "POST",
    headers: { "content-length": String(MAX_MARKET_FORM_BYTES + 1) }
  });
  assert.throws(() => assertRequestSize(request, MAX_MARKET_FORM_BYTES), /too large/);
});

test("admin upload request requires a valid content length", () => {
  const request = new Request("https://vota.test/api/admin/markets", { method: "POST" });
  assert.throws(() => assertRequestSize(request, MAX_MARKET_FORM_BYTES), /content length/);
});
