import { STARTER_CREDITS } from "../src/lib/constants";
import { mutateDataStore, transitionMarketData, updateStageControlsData, useSupabaseStore } from "../src/lib/data";
import { createMarket } from "../src/lib/store";
import type { EventRecord, Market } from "../src/lib/types";

type E2EEvent = Pick<EventRecord, "id" | "slug" | "name">;

const SEEDED_AT = "2026-06-21T10:00:00.000Z";

const E2E_EVENTS: E2EEvent[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    slug: "megathon",
    name: "Megathon"
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    slug: "megatalkTesting",
    name: "megatalkTesting"
  }
];

const MARKET_IDS: Record<string, [string, string]> = {
  megathon: [
    "00000000-0000-4000-8000-000000000201",
    "00000000-0000-4000-8000-000000000202"
  ],
  megatalkTesting: [
    "00000000-0000-4000-8000-000000000301",
    "00000000-0000-4000-8000-000000000302"
  ]
};

const OUTCOME_IDS: Record<string, string[]> = {
  "00000000-0000-4000-8000-000000000201": [
    "00000000-0000-4000-8000-000000000211",
    "00000000-0000-4000-8000-000000000212",
    "00000000-0000-4000-8000-000000000213"
  ],
  "00000000-0000-4000-8000-000000000202": [
    "00000000-0000-4000-8000-000000000221",
    "00000000-0000-4000-8000-000000000222"
  ],
  "00000000-0000-4000-8000-000000000301": [
    "00000000-0000-4000-8000-000000000311",
    "00000000-0000-4000-8000-000000000312",
    "00000000-0000-4000-8000-000000000313"
  ],
  "00000000-0000-4000-8000-000000000302": [
    "00000000-0000-4000-8000-000000000321",
    "00000000-0000-4000-8000-000000000322"
  ]
};

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("E2E Supabase seed requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${url}/rest/v1${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase seed request failed (${response.status}): ${detail || response.statusText}`);
  }
  if (response.status === 204) return [];
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function selectRows(table: string, query: string) {
  return (await supabaseFetch(`/${table}?${query}`)) as Array<Record<string, any>>;
}

async function deleteWhere(table: string, filter: string) {
  await supabaseFetch(`/${table}?${filter}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

function inFilter(column: string, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return "";
  return `${column}=in.(${unique.join(",")})`;
}

async function deleteByIn(table: string, column: string, ids: string[]) {
  const filter = inFilter(column, ids);
  if (!filter) return;
  await deleteWhere(table, filter);
}

async function resetSupabaseEvent(input: E2EEvent) {
  const eventRows = await selectRows(
    "events",
    `select=id&or=(id.eq.${encodeURIComponent(input.id)},slug.eq.${encodeURIComponent(input.slug)})`
  );
  const eventIds = eventRows.map((event) => String(event.id));
  if (eventIds.length === 0) return;

  const [marketRows, participantRows, agentRows] = await Promise.all([
    selectRows("markets", `select=id&${inFilter("event_id", eventIds)}`),
    selectRows("participants", `select=id&${inFilter("event_id", eventIds)}`),
    selectRows("agent_profiles", `select=id&${inFilter("event_id", eventIds)}`)
  ]);
  const marketIds = marketRows.map((market) => String(market.id));
  const participantIds = participantRows.map((participant) => String(participant.id));
  const agentIds = agentRows.map((agent) => String(agent.id));
  const purchaseRows = participantIds.length
    ? await selectRows("purchases", `select=id&${inFilter("participant_id", participantIds)}`)
    : [];
  const purchaseIds = purchaseRows.map((purchase) => String(purchase.id));

  await deleteByIn("mcp_tokens", "participant_id", participantIds);
  await deleteByIn("agent_runs", "agent_profile_id", agentIds);
  await deleteByIn("agent_runs", "market_id", marketIds);
  await deleteByIn("ledger_entries", "participant_id", participantIds);
  await deleteByIn("ledger_entries", "market_id", marketIds);
  await deleteByIn("prediction_actions", "participant_id", participantIds);
  await deleteByIn("prediction_actions", "market_id", marketIds);
  await deleteByIn("positions", "participant_id", participantIds);
  await deleteByIn("positions", "market_id", marketIds);
  await deleteByIn("checkout_intents", "participant_id", participantIds);
  await deleteByIn("checkout_intents", "purchase_id", purchaseIds);
  await deleteByIn("purchases", "id", purchaseIds);
  await deleteByIn("participant_sessions", "participant_id", participantIds);
  await deleteByIn("participant_sessions", "event_id", eventIds);
  await deleteByIn("wallets", "participant_id", participantIds);
  await deleteByIn("participants", "id", participantIds);
  await deleteByIn("agent_profiles", "id", agentIds);
  await deleteByIn("market_aggregates", "market_id", marketIds);
  await deleteByIn("outcomes", "market_id", marketIds);
  await deleteByIn("markets", "id", marketIds);
  await deleteByIn("admin_audit_logs", "entity_id", [...eventIds, ...marketIds, ...participantIds, ...purchaseIds]);
  await deleteByIn("events", "id", eventIds);
}

function eventRecord(input: E2EEvent): EventRecord {
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    status: "live",
    starterCredits: STARTER_CREDITS,
    emergencyPaused: false,
    stageMode: "live",
    createdAt: SEEDED_AT
  };
}

async function resetEvent(input: E2EEvent) {
  if (useSupabaseStore()) {
    await resetSupabaseEvent(input);
  }
  await mutateDataStore((store) => {
    const existingEventIds = new Set(
      store.events
        .filter((event) => event.slug === input.slug || event.id === input.id)
        .map((event) => event.id)
    );
    const existingMarketIds = new Set(
      store.markets.filter((market) => existingEventIds.has(market.eventId)).map((market) => market.id)
    );
    const existingParticipantIds = new Set(
      store.participants
        .filter((participant) => existingEventIds.has(participant.eventId))
        .map((participant) => participant.id)
    );
    const existingPurchaseIds = new Set(
      store.purchases
        .filter((purchase) => existingParticipantIds.has(purchase.participantId))
        .map((purchase) => purchase.id)
    );
    const existingAgentIds = new Set(
      store.agentProfiles.filter((agent) => existingEventIds.has(agent.eventId)).map((agent) => agent.id)
    );

    store.ledgerEntries = store.ledgerEntries.filter(
      (entry) => !existingParticipantIds.has(entry.participantId) && !existingMarketIds.has(entry.marketId || "")
    );
    store.predictionActions = store.predictionActions.filter(
      (action) => !existingParticipantIds.has(action.participantId) && !existingMarketIds.has(action.marketId)
    );
    store.positions = store.positions.filter(
      (position) => !existingParticipantIds.has(position.participantId) && !existingMarketIds.has(position.marketId)
    );
    store.checkoutIntents = store.checkoutIntents.filter((intent) => !existingParticipantIds.has(intent.participantId));
    store.purchases = store.purchases.filter((purchase) => !existingPurchaseIds.has(purchase.id));
    store.participantSessions = store.participantSessions.filter(
      (session) => !existingParticipantIds.has(session.participantId)
    );
    store.wallets = store.wallets.filter((wallet) => !existingParticipantIds.has(wallet.participantId));
    store.agentRuns = store.agentRuns.filter(
      (run) => !existingAgentIds.has(run.agentProfileId) && !existingMarketIds.has(run.marketId)
    );
    store.agentProfiles = store.agentProfiles.filter((agent) => !existingEventIds.has(agent.eventId));
    store.marketAggregates = store.marketAggregates.filter((aggregate) => !existingMarketIds.has(aggregate.marketId));
    store.outcomes = store.outcomes.filter((outcome) => !existingMarketIds.has(outcome.marketId));
    store.markets = store.markets.filter((market) => !existingMarketIds.has(market.id));
    store.participants = store.participants.filter((participant) => !existingParticipantIds.has(participant.id));
    store.events = store.events.filter((event) => event.slug !== input.slug && event.id !== input.id);

    const event = eventRecord(input);
    store.events.push(event);
    return event;
  });
}

async function createOpenMarket(
  eventSlug: string,
  marketId: string,
  title: string,
  category: string,
  outcomeLabels: string[]
) {
  const market = await mutateDataStore((store) => {
    const created = createMarket(store, {
      eventSlug,
      title,
      description: `${title} - seeded for local Playwright coverage.`,
      category,
      resolutionRule: "Resolved by the local Playwright admin flow.",
      outcomes: outcomeLabels.map((label) => ({ label })),
      showOnStage: true,
      fairLaunchOverride: true,
      fairLaunchPeopleThreshold: 1,
      fairLaunchSignalCreditsThreshold: 100,
      maxActionStake: 500,
      allowSwitching: true,
      blindLaunchEnabled: false,
      blindLaunchPredictionThreshold: 1,
      blindLaunchSeconds: 10,
      auditIp: "e2e-seed"
    }) as Market;
    const oldMarketId = created.id;
    created.id = marketId;
    created.updatedAt = SEEDED_AT;

    store.outcomes
      .filter((outcome) => outcome.marketId === oldMarketId)
      .forEach((outcome, index) => {
        outcome.marketId = marketId;
        outcome.id = OUTCOME_IDS[marketId]?.[index] || outcome.id;
      });

    const aggregate = store.marketAggregates.find((item) => item.marketId === oldMarketId);
    if (aggregate) aggregate.marketId = marketId;

    const auditLog = store.adminAuditLogs.find((item) => item.entityId === oldMarketId);
    if (auditLog) auditLog.entityId = marketId;

    return created;
  });
  await transitionMarketData(market.id, "open", "e2e-seed");
  return market;
}

async function seedEvent(input: E2EEvent) {
  await resetEvent(input);
  const [winnerMarketId, demoMarketId] = MARKET_IDS[input.slug];
  const winner = await createOpenMarket(input.slug, winnerMarketId, `Who wins ${input.name}?`, "Finals", [
    "Team Orbit",
    "Team Nova",
    "Team Atlas"
  ]);
  await createOpenMarket(input.slug, demoMarketId, `Will ${input.name} demo fail?`, "Demo", ["Yes", "No"]);
  await updateStageControlsData(
    {
      eventSlug: input.slug,
      stageMode: "live",
      featuredMarketId: winner.id,
      emergencyPaused: false
    },
    "e2e-seed"
  );
}

async function main() {
  for (const event of E2E_EVENTS) {
    await seedEvent(event);
  }
  console.log(`Seeded E2E rooms: ${E2E_EVENTS.map((event) => `${event.name} /${event.slug}`).join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
