import assert from "node:assert/strict";
import test from "node:test";
import { recordsToCsv, spreadsheetSafeCell } from "../src/lib/csv";

test("CSV cells are escaped for spreadsheet formulas", () => {
  assert.equal(spreadsheetSafeCell("=IMPORTDATA(\"https://example.test\")"), "'=IMPORTDATA(\"https://example.test\")");
  assert.equal(spreadsheetSafeCell(" +SUM(1,1)"), "' +SUM(1,1)");
  assert.equal(spreadsheetSafeCell("@cmd"), "'@cmd");
  assert.equal(spreadsheetSafeCell("plain text"), "plain text");
});

test("CSV export quotes values after spreadsheet sanitization", () => {
  const csv = recordsToCsv([{ action: "create_market", details: "=1+1", note: "safe, quoted" }]);
  assert.equal(csv, 'action,details,note\n"create_market","\'=1+1","safe, quoted"');
});

test("CSV export can include headers for empty filtered datasets", () => {
  const csv = recordsToCsv([], ["id", "nickname", "role"]);
  assert.equal(csv, "id,nickname,role");
});
