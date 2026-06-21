import { AdminLiveRefresh } from "@/components/admin-live-refresh";
import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, Card, Container, Field, Select, Shell, SubmitButton } from "@/components/ui";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";
import { getEventOrThrow } from "@/lib/store";
import type { StageMode } from "@/lib/types";

export const dynamic = "force-dynamic";

const modes: Array<{ value: StageMode; label: string }> = [
  { value: "join", label: "Join QR mode" },
  { value: "live", label: "Live market mode" },
  { value: "role_battle", label: "Role battle mode" },
  { value: "humans_vs_agents", label: "Humans vs Agents mode" },
  { value: "leaderboard", label: "Leaderboard mode" },
  { value: "resolution", label: "Resolution reveal mode" }
];

export default async function StageAdminPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; eventSlug?: string | string[] }> }) {
  const params = await searchParams;
  const error = firstSearchParam(params.error);
  const eventSlug = firstSearchParam(params.eventSlug) || DEFAULT_EVENT_SLUG;
  const store = await readDataStore();
  const event = getEventOrThrow(store, eventSlug);
  const markets = store.markets.filter((market) =>
    market.eventId === event.id && market.status !== "draft" && market.status !== "voided" && market.showOnStage
  );
  const activeStageMarkets = markets.filter((market) => market.status !== "resolved");
  const resolvedMarkets = markets.filter((market) => market.status === "resolved");
  const stageWarning =
    markets.length === 0
      ? "No stage-visible markets are available yet. Open a market and keep Show on stage enabled before switching to a market mode."
      : activeStageMarkets.length === 0
        ? "Live, role battle, and humans-vs-agents modes need an open or locked stage-visible market."
      : resolvedMarkets.length === 0
        ? "Resolution reveal becomes available after a market is resolved."
        : "";
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={event.slug} />
        <AdminPageHeader kicker="Big screen controls" title="Stage">
          <AdminLiveRefresh />
        </AdminPageHeader>
        <Card className="bg-paper">
          <p className="text-sm font-bold text-muted">Operating on event</p>
          <h2 className="mt-1 text-xl font-black">{event.name}</h2>
          <p className="mt-1 text-xs font-semibold text-muted">Use the event control room for event-specific market setup and one-click stage actions.</p>
        </Card>
        {error ? (
          <Card className="border-danger bg-danger/10">
            <h2 className="text-lg font-black text-danger">Stage update failed</h2>
            <p className="mt-1 text-sm font-bold text-muted">{error}</p>
          </Card>
        ) : null}
        <Card>
          <form action="/api/admin/stage" method="post" className="mt-6 grid gap-4">
            <input type="hidden" name="eventSlug" value={event.slug} />
            <input type="hidden" name="returnTo" value={`/admin/stage?eventSlug=${encodeURIComponent(event.slug)}`} />
            <input type="hidden" name="emergencyPausedControl" value="1" />
            <Field label="Stage mode">
              <Select name="stageMode" defaultValue={event.stageMode}>
                {modes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Featured market">
              <Select name="featuredMarketId" defaultValue={event.featuredMarketId || markets[0]?.id || ""} disabled={markets.length === 0}>
                {markets.length === 0 ? <option value="">No stage-visible markets</option> : null}
              {markets.map((market) => (
                <option key={market.id} value={market.id}>
                  {market.title} ({market.status}{market.status === "resolved" ? ", resolution only" : ""})
                </option>
              ))}
            </Select>
              <span className="text-xs font-semibold text-muted">
                Live/role modes use open or locked markets. Resolution mode uses resolved markets.
              </span>
              {stageWarning ? <span className="text-xs font-semibold text-muted">{stageWarning}</span> : null}
            </Field>
            <label className="flex items-center gap-3 rounded-xl bg-paper p-3 text-sm font-bold">
              <input type="checkbox" name="emergencyPaused" defaultChecked={event.emergencyPaused} />
              Emergency pause sensitive user actions
            </label>
            <SubmitButton>Update stage</SubmitButton>
          </form>
        </Card>
      </Container>
    </Shell>
  );
}
