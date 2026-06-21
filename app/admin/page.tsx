import Link from "next/link";
import { AdminLiveRefresh } from "@/components/admin-live-refresh";
import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, ButtonLink, Card, Container, Shell, Stat, StatusPill } from "@/components/ui";
import { resolveAdminEvent } from "@/lib/admin-events";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";
import { dashboardMetrics, leaderboardGroups } from "@/lib/store";
import { baseUrl, credits, euro, mbucks } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams
}: {
  searchParams: Promise<{ eventSlug?: string | string[] }>;
}) {
  const store = await readDataStore();
  const { event: selectedEvent, requestedSlug, usedFallback } = resolveAdminEvent(store, firstSearchParam((await searchParams).eventSlug));
  if (!selectedEvent) {
    return (
      <Shell className="bg-admin">
        <Container className="grid gap-6">
          <AdminNav />
          <Card>No events are configured yet.</Card>
        </Container>
      </Shell>
    );
  }
  const metrics = dashboardMetrics(store, selectedEvent.slug);
  const groups = leaderboardGroups(store, selectedEvent.slug);
  const leaders = groups.overall.slice(0, 5);
  const eventMarkets = store.markets.filter((market) => market.eventId === metrics.event.id);
  const stageUrl = `${baseUrl().replace(/\/$/, "")}/stage/${metrics.event.slug}`;
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={metrics.event.slug} />
        <AdminPageHeader kicker="Native Next.js admin" title={`${metrics.event.name} control room`}>
          <div className="flex flex-wrap items-center gap-2">
            <AdminLiveRefresh />
            <ButtonLink href={`/stage/${metrics.event.slug}`} variant="secondary">Stage screen</ButtonLink>
            <ButtonLink href={`/admin/events/${metrics.event.slug}`}>Event detail</ButtonLink>
          </div>
        </AdminPageHeader>
        {usedFallback ? (
          <Card className="border-warn bg-warn/15">
            <p className="text-sm font-bold text-ink">Event not found: {requestedSlug}. Showing {metrics.event.name} instead.</p>
          </Card>
        ) : null}
        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Event status" value={metrics.event.status} />
          <Stat label="Participants" value={metrics.totalParticipants} />
          <Stat label="Active markets" value={metrics.activeMarkets} />
          <Stat label="Predictions" value={metrics.predictionsSubmitted} />
          <Stat label="Committed" value={mbucks(metrics.creditsCommitted)} />
          <Stat label="Stage mode" value={metrics.event.stageMode} />
          <Stat label="Emergency pause" value={metrics.event.emergencyPaused ? "On" : "Off"} />
          <Stat label="Platform 2% provision" value={mbucks(metrics.virtualProvisionCredits)} />
          <Stat label="Test checkouts" value={metrics.testCheckouts.completed} />
          <Stat label="Projected supporter value" value={euro(metrics.testCheckouts.projectedEur)} />
          <Stat label="Predictions per participant" value={metrics.predictionsPerParticipant.toFixed(1)} />
          <Stat label="Scan-to-first prediction" value={`${Math.round(metrics.scanToFirstPrediction * 100)}%`} />
        </section>
        <Card className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="font-mono-vota text-[10px] font-bold uppercase text-faded">Stage URL</p>
            <p className="mt-1 break-all font-mono-vota text-sm font-bold text-ink">{stageUrl}</p>
          </div>
          <ButtonLink href={`/stage/${metrics.event.slug}`} variant="secondary">Open stage screen</ButtonLink>
        </Card>
        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">Markets</h2>
              <ButtonLink href={`/admin/markets/new?eventSlug=${encodeURIComponent(metrics.event.slug)}`}>Create prediction</ButtonLink>
            </div>
            <div className="grid gap-2">
              {eventMarkets.map((market) => (
                <Link key={market.id} href={`/admin/markets/${market.id}`} className="grid rounded-xl bg-paper p-3 transition hover:bg-soft">
                  <span className="flex items-center justify-between gap-3">
                    <strong>{market.title}</strong>
                    <StatusPill>{market.status}</StatusPill>
                  </span>
                  <span className="text-sm font-semibold text-muted">{market.category}</span>
                </Link>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="text-xl font-black">Top Oracles</h2>
            <div className="mt-3 grid gap-2">
              {leaders.map((leader, index) => (
                <div key={leader.id} className="grid grid-cols-[32px_1fr_auto] rounded-xl bg-paper p-3 text-sm font-bold">
                  <span className="font-mono-vota text-faded">{index + 1}</span>
                  <span className="min-w-0 break-words">{leader.nickname}</span>
                  <span className="text-right">{credits(leader.oracleScore)}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>
        <section className="grid gap-4 lg:grid-cols-3">
          <AdminBoard title="Humans" rows={groups.humans.slice(0, 5)} metric="oracleScore" />
          <AdminBoard title="Agents" rows={groups.agents.slice(0, 5)} metric="oracleScore" />
          <AdminBoard title="Contrarian calls" rows={groups.contrarianCalls.slice(0, 5)} metric="contrarianScore" />
        </section>
      </Container>
    </Shell>
  );
}

function AdminBoard({
  title,
  rows,
  metric
}: {
  title: string;
  rows: Array<{ id: string; nickname: string; oracleScore: number; contrarianScore: number }>;
  metric: "oracleScore" | "contrarianScore";
}) {
  return (
    <Card>
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-3 grid gap-2">
        {rows.length === 0 ? <p className="text-sm font-bold text-muted">No scored entries yet.</p> : null}
        {rows.map((row, index) => (
          <div key={`${title}-${row.id}`} className="grid grid-cols-[32px_1fr_auto] rounded-xl bg-paper p-3 text-sm font-bold">
            <span className="font-mono-vota text-faded">{index + 1}</span>
            <span className="min-w-0 break-words">{row.nickname}</span>
            <span className="font-mono-vota text-right text-ember">{credits(row[metric])}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
