import { AdminLiveRefresh } from "@/components/admin-live-refresh";
import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, ButtonLink, Card, Container, Field, Select, Shell, Stat, StatusPill, SubmitButton } from "@/components/ui";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";
import { dashboardMetrics, publicState } from "@/lib/store";
import { baseUrl, mbucks } from "@/lib/utils";
import type { StageMode } from "@/lib/types";

export const dynamic = "force-dynamic";

const modes: Array<{ value: StageMode; label: string }> = [
  { value: "join", label: "Join QR" },
  { value: "live", label: "Live market" },
  { value: "humans_vs_agents", label: "Humans vs Agents" },
  { value: "leaderboard", label: "Leaderboard" },
  { value: "resolution", label: "Resolution reveal" }
];

export default async function EventAdminPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { slug } = await params;
  const error = firstSearchParam((await searchParams).error);
  const store = await readDataStore();
  const fallbackEvent = store.events.find((event) => event.slug === DEFAULT_EVENT_SLUG) || store.events[0];
  if (!store.events.some((event) => event.slug === slug)) {
    return (
      <Shell className="bg-admin">
        <Container className="grid gap-6">
          <AdminNav eventSlug={fallbackEvent?.slug} />
          <Card className="grid gap-4">
            <div>
              <h1 className="text-2xl font-black">Event not found</h1>
              <p className="mt-2 text-sm font-bold text-muted">
                This admin link points to a room that no longer exists or is not available in this environment.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/admin/events">All events</ButtonLink>
              {fallbackEvent ? (
                <ButtonLink href={`/admin/events/${fallbackEvent.slug}`} variant="secondary">
                  Open {fallbackEvent.name}
                </ButtonLink>
              ) : null}
            </div>
          </Card>
        </Container>
      </Shell>
    );
  }
  const metrics = dashboardMetrics(store, slug);
  const state = publicState(store, slug);
  const markets = store.markets.filter((market) => market.eventId === metrics.event.id);
  const stageMarkets = markets.filter((market) => market.status !== "draft" && market.status !== "voided" && market.showOnStage);
  const activeStageMarkets = stageMarkets.filter((market) => market.status !== "resolved");
  const resolvedStageMarkets = stageMarkets.filter((market) => market.status === "resolved");
  const stageUrl = `${baseUrl().replace(/\/$/, "")}/stage/${slug}`;
  const stageWarning =
    stageMarkets.length === 0
      ? "No stage-visible markets are available yet. Open a market and keep Show on stage enabled before switching to a market mode."
      : activeStageMarkets.length === 0
        ? "Live and humans-vs-agents modes need an open or locked stage-visible market."
      : resolvedStageMarkets.length === 0
        ? "Resolution reveal becomes available after a market is resolved."
        : "";
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={slug} />
        <AdminPageHeader kicker="Event controls" title={metrics.event.name}>
          <AdminLiveRefresh />
        </AdminPageHeader>
        {error ? (
          <Card className="border-danger bg-danger/10">
            <h2 className="text-lg font-black text-danger">Control update failed</h2>
            <p className="mt-1 text-sm font-bold text-muted">{error}</p>
          </Card>
        ) : null}
        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Status" value={metrics.event.status} />
          <Stat label="Stage mode" value={metrics.event.stageMode} />
          <Stat label="Participants" value={metrics.totalParticipants} />
          <Stat label="Platform provision" value={mbucks(metrics.virtualProvisionCredits)} />
        </section>
        <Card className="bg-ink text-white">
          <h2 className="text-xl font-black">Control room</h2>
          <div className="mt-3 rounded-xl border border-white/15 bg-white/10 p-3">
            <p className="font-mono-vota text-[10px] font-bold uppercase text-white/55">Stage URL</p>
            <p className="mt-1 break-all font-mono-vota text-xs font-bold text-white">{stageUrl}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ButtonLink href={`/stage/${slug}`} variant="secondary">Open stage</ButtonLink>
            <ButtonLink href={`/admin/markets/new?eventSlug=${encodeURIComponent(slug)}`} variant="secondary">New market</ButtonLink>
            <ButtonLink href={`/admin/participants?eventSlug=${slug}`} variant="secondary">Participants</ButtonLink>
            <ButtonLink href={`/admin/payments?eventSlug=${encodeURIComponent(slug)}`} variant="secondary">Payments</ButtonLink>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-black">Stage quick controls</h2>
          <form action="/api/admin/stage" method="post" className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <input type="hidden" name="eventSlug" value={slug} />
            <input type="hidden" name="returnTo" value={`/admin/events/${slug}`} />
            <input type="hidden" name="emergencyPausedControl" value="1" />
            <Field label="Mode">
              <Select name="stageMode" defaultValue={metrics.event.stageMode}>
                {modes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Featured market">
              <Select name="featuredMarketId" defaultValue={metrics.event.featuredMarketId || stageMarkets[0]?.id || ""} disabled={stageMarkets.length === 0}>
                {stageMarkets.length === 0 ? <option value="">No stage-visible markets</option> : null}
                {stageMarkets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {market.title} ({market.status}{market.status === "resolved" ? ", resolution only" : ""})
                  </option>
                ))}
              </Select>
              <span className="text-xs font-semibold text-muted">
                Live and humans-vs-agents modes use open or locked markets. Resolution mode uses resolved markets.
              </span>
              {stageWarning ? <span className="text-xs font-semibold text-muted">{stageWarning}</span> : null}
            </Field>
            <label className="flex items-center gap-3 rounded-xl bg-paper p-3 text-sm font-bold md:col-span-2">
              <input type="checkbox" name="emergencyPaused" defaultChecked={metrics.event.emergencyPaused} />
              Emergency pause predictions and MegaBuck top-ups for this event
            </label>
            <SubmitButton>Update stage</SubmitButton>
          </form>
        </Card>
        <section className="grid gap-3">
          {markets.map((market) => (
            <Card key={market.id} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="mb-2 flex flex-wrap gap-2">
                  <StatusPill>{market.status}</StatusPill>
                  {market.showOnStage ? <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-bold uppercase text-ink">Stage</span> : null}
                </div>
                <h2 className="text-2xl font-black">{market.title}</h2>
                <p className="mt-1 text-sm font-semibold text-muted">{market.category}</p>
              </div>
              <ButtonLink href={`/admin/markets/${market.id}`} variant="secondary">Manage</ButtonLink>
            </Card>
          ))}
        </section>
        <Card>
          <h2 className="text-xl font-black">Public state preview</h2>
          <pre className="font-mono-vota mt-3 max-h-[520px] overflow-auto rounded-xl bg-ink p-4 text-xs text-white">
            {JSON.stringify(state, null, 2)}
          </pre>
        </Card>
      </Container>
    </Shell>
  );
}
