const target = process.env.READINESS_URL;
const requireTarget = process.env.REQUIRE_READINESS_URL === "1" || process.env.CI === "true";

if (!target) {
  if (requireTarget) {
    console.error("READINESS_URL is required for deployed readiness verification.");
    process.exit(1);
  }
  console.log("READINESS_URL is not set; skipping deployed readiness endpoint check.");
  process.exit(0);
}

let url;
try {
  url = new URL(target);
  if (!url.pathname || url.pathname === "/") url.pathname = "/api/readiness";
} catch {
  console.error(`Invalid READINESS_URL: ${target}`);
  process.exit(1);
}

const response = await fetch(url, { headers: { accept: "application/json" } });
const text = await response.text();
let report;
try {
  report = JSON.parse(text);
} catch {
  console.error(`Readiness endpoint did not return JSON: HTTP ${response.status}`);
  console.error(text.slice(0, 500));
  process.exit(1);
}

if (!response.ok || report.ready !== true) {
  const counts = report.counts ? `pass=${report.counts.pass} warn=${report.counts.warn} fail=${report.counts.fail}` : "missing counts";
  console.error(`Readiness failed at ${url.href}: HTTP ${response.status}; ${counts}`);
  for (const group of report.groups || []) {
    for (const check of group.checks || []) {
      if (check.status === "fail") console.error(`- ${group.title}: ${check.label} - ${check.detail}`);
    }
  }
  process.exit(1);
}

console.log(`Readiness passed at ${url.href}: pass=${report.counts.pass} warn=${report.counts.warn} fail=${report.counts.fail}`);
