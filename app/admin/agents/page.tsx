import { AdminNav } from "@/components/admin-nav";
import { McpTokenForm } from "@/components/mcp-token-form";
import { AdminPageHeader, Card, Container, Kicker, Shell, SubmitButton } from "@/components/ui";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export default async function AgentsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string | string[]; mcpTokenCreated?: string | string[]; eventSlug?: string | string[] }>;
}) {
  const params = await searchParams;
  const error = firstSearchParam(params.error);
  const mcpTokenCreated = firstSearchParam(params.mcpTokenCreated);
  const eventSlug = firstSearchParam(params.eventSlug) || DEFAULT_EVENT_SLUG;
  const store = await readDataStore();
  const event = store.events.find((item) => item.slug === eventSlug);
  const agents = store.agentProfiles.filter((agent) => agent.eventId === event?.id);
  const markets = store.markets.filter((market) => market.eventId === event?.id && market.status === "open");
  const participants = store.participants
    .filter((participant) => participant.eventId === event?.id && !participant.isBanned)
    .map((participant) => ({
      id: participant.id,
      nickname: participant.nickname,
      participantType: participant.participantType
    }));
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={event?.slug || eventSlug} />
        <AdminPageHeader kicker="Autonomous oracles" title="Agents" />
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
              <input type="hidden" name="eventSlug" value={event?.slug || eventSlug} />
              <SubmitButton>Initialize house agents</SubmitButton>
            </form>
          ) : null}
          <div className="mt-6 grid gap-3">
            {agents.map((agent) => (
              <form key={agent.id} action="/api/admin/agents/run-house-agent" method="post" className="grid gap-3 rounded-xl bg-paper p-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                <input type="hidden" name="eventSlug" value={event?.slug || eventSlug} />
                <input type="hidden" name="agentId" value={agent.id} />
                <div>
                  <strong>{agent.name}</strong>
                  <div className="text-sm font-semibold text-muted">{agent.strategy}</div>
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
            <McpTokenForm participants={participants} />
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-black">Recent runs</h2>
          <div className="mt-3 grid gap-2">
            {store.agentRuns.slice(-12).reverse().map((run) => (
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
