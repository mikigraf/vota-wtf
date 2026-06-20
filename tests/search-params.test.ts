import assert from "node:assert/strict";
import test from "node:test";
import { firstSearchParam } from "../src/lib/search-params";

test("firstSearchParam normalizes duplicate query parameters", () => {
  assert.equal(firstSearchParam("one"), "one");
  assert.equal(firstSearchParam(["one", "two"]), "one");
  assert.equal(firstSearchParam(undefined), undefined);
});
