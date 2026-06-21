import assert from "node:assert/strict";
import test from "node:test";
import { generatedAvatarDataUrl, isGeneratedAvatarUrl } from "../src/lib/avatar";

test("generated avatars are deterministic SVG data URLs", () => {
  const first = generatedAvatarDataUrl("demo_druid", "builder");
  const second = generatedAvatarDataUrl("demo_druid", "builder");
  assert.equal(first, second);
  assert.equal(generatedAvatarDataUrl("", "other"), generatedAvatarDataUrl("", "other"));
  assert.equal(isGeneratedAvatarUrl(first), true);
  assert.match(decodeSvg(first), /data-vota-avatar="1"/);
  assert.match(decodeSvg(first), />DD</);
  assert.doesNotMatch(decodeSvg(first), />BUILDER|>SPONSOR|>INVESTOR|>OTHER/);
});

test("generated avatars escape normalized nickname initials", () => {
  const svg = decodeSvg(generatedAvatarDataUrl("<xscript", "sponsor"));
  assert.doesNotMatch(svg, /<script/i);
  assert.match(svg, />XS</);
  assert.doesNotMatch(svg, />BUILDER|>SPONSOR|>INVESTOR|>OTHER/);
});

test("generated avatar detection ignores uploaded and remote images", () => {
  assert.equal(isGeneratedAvatarUrl("/uploads/avatars/avatar.webp"), false);
  assert.equal(isGeneratedAvatarUrl("https://example.test/avatar.webp"), false);
  assert.equal(isGeneratedAvatarUrl(undefined), false);
});

function decodeSvg(dataUrl: string) {
  const prefix = "data:image/svg+xml;utf8,";
  assert.equal(dataUrl.startsWith(prefix), true);
  return decodeURIComponent(dataUrl.slice(prefix.length));
}
