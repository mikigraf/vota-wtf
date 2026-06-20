import assert from "node:assert/strict";
import test from "node:test";
import { readJsonObject } from "../src/lib/http";

test("readJsonObject accepts objects and normalizes invalid JSON shapes", async () => {
  const object = await readJsonObject(new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ ok: true })
  }));
  assert.equal(object.ok, true);

  const nullBody = await readJsonObject(new Request("https://example.test", {
    method: "POST",
    body: "null"
  }));
  assert.deepEqual(nullBody, {});

  const arrayBody = await readJsonObject(new Request("https://example.test", {
    method: "POST",
    body: "[]"
  }));
  assert.deepEqual(arrayBody, {});
});
