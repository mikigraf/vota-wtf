import { AdminNav } from "@/components/admin-nav";
import { McpTokenForm } from "@/components/mcp-token-form";
import { AdminPageHeader, Card, Container, Kicker, Shell, SubmitButton } from "@/components/ui";
import { resolveAdminEvent } from "@/lib/admin-events";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";
import type { AgentProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AgentsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string | string[]; mcpTokenCreated?: string | string[]; eventSlug?: string | string[] }>;
}) {
  const params = await searchParams;
  const error = firstSearchParam(params.error);
  const mcpTokenCreated = firstSearchParam(params.mcpTokenCreated);
  const store = await readDataStore();
  const { event, requestedSlug, usedFallback } = resolveAdminEvent(store, firstSearchParam(params.eventSlug));
  const agents = store.agentProfiles.filter((agent) => agent.eventId === event?.id);
  const agentIds = new Set(agents.map((agent) => agent.id));
  const recentRuns = store.agentRuns.filter((run) => agentIds.has(run.agentProfileId)).slice(-12).reverse();
  const markets = store.markets.filter((market) => market.eventId === event?.id && market.status === "open");
  const participants = store.participants
    .filter((participant) => participant.eventId === event?.id && participant.participantType !== "platform" && !participant.isBanned)
    .map((participant) => ({
      id: participant.id,
      nickname: participant.nickname,
      participantType: participant.participantType
    }));
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={event?.slug || requestedSlug} />
        <AdminPageHeader kicker="Autonomous oracles" title="Agents" />
        {usedFallback ? (
          <Card className="border-warn bg-warn/15">
            <p className="text-sm font-bold text-ink">Event not found: {requestedSlug}. Showing {event?.name || requestedSlug} instead.</p>
          </Card>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-ember bg-ember/10 p-3 text-sm font-bold text-ember">
            Agent action failed: {error}
          </div>
        ) : null}
        {mcpTokenCreated ? (
          <div className="rounded-xl border border-mint bg-mint/20 p-3 text-sm font-bold text-ink">
            MCP token created. Copy it from the token panel before leaving this page.
          </div>
        ) : null}
        <Card>
          <Kicker>Rule-based personas</Kicker>
          <h2 className="font-expanded mt-2 text-3xl font-black">House agents</h2>
          <p className="mt-3 text-sm font-semibold text-muted">
            Agents are simple rule-based personas and use the same prediction API and Whale Guard as humans.
          </p>
          {agents.length === 0 ? (
            <form action="/api/admin/agents/ensure" method="post" className="mt-6">
              <input type="hidden" name="eventSlug" value={event?.slug || requestedSlug} />
              <SubmitButton>Initialize house agents</SubmitButton>
            </form>
          ) : null}
          <div className="mt-6 grid gap-3">
            {agents.map((agent) => (
              <form key={agent.id} action="/api/admin/agents/run-house-agent" method="post" className="grid gap-3 rounded-xl bg-paper p-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                <input type="hidden" name="eventSlug" value={event?.slug || requestedSlug} />
                <input type="hidden" name="agentId" value={agent.id} />
                <div>
                  <strong>{agent.name}</strong>
                  <div className="text-sm font-semibold text-muted">{agentStrategyLabel(agent.strategy)}</div>
                </div>
                <select name="marketId" className="focus-ring min-h-11 rounded-xl border-[1.5px] border-line bg-white px-3 text-sm font-semibold">
                  {markets.map((market) => (
                    <option key={market.id} value={market.id}>
                      {market.title}
                    </option>
                  ))}
                </select>
                <SubmitButton>Run agent</SubmitButton>
              </form>
            ))}
          </div>
        </Card>
        <Card>
          <Kicker>Optional MCP</Kicker>
          <h2 className="font-expanded mt-2 text-2xl font-black">External agent write token</h2>
          <p className="mt-3 text-sm font-semibold text-muted">
            Create a scoped bearer token for the MCP place_prediction tool. The token is shown once and the hash is stored server-side.
          </p>
          <div className="mt-5">
            <McpTokenForm eventSlug={event?.slug || requestedSlug} participants={participants} />
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-black">Recent runs</h2>
          <div className="mt-3 grid gap-2">
            {recentRuns.map((run) => (
              <div key={run.id} className="rounded-xl bg-paper p-3 text-sm font-bold">
                {run.status}: {run.note}
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </Shell>
  );
}

function agentStrategyLabel(strategy: AgentProfile["strategy"]) {
  if (strategy === "builder_bias") return "Early signal";
  if (strategy === "sponsor_bias") return "Crowd energy";
  if (strategy === "investor_bias") return "Conviction value";
  if (strategy === "skeptic") return "Skeptic";
  return "Chaos";
}
