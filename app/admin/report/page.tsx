import { AdminLiveRefresh } from "@/components/admin-live-refresh";
import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, Card, Container, Shell, Stat, StatusPill } from "@/components/ui";
import { buildAdvancedAnalyticsReport } from "@/lib/analytics";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";
import { credits, mbucks, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminReportPage({
  searchParams
}: {
  searchParams: Promise<{ eventSlug?: string | string[] }>;
}) {
  const eventSlug = firstSearchParam((await searchParams).eventSlug) || DEFAULT_EVENT_SLUG;
  const report = buildAdvancedAnalyticsReport(await readDataStore(), eventSlug);
  const exportBase = `/api/admin/report?eventSlug=${encodeURIComponent(report.event.slug)}`;

  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={report.event.slug} />
        <AdminPageHeader kicker="Advanced analytics" title={`${report.event.name} report`}>
          <div className="flex flex-wrap items-center gap-2">
            <AdminLiveRefresh />
            <a className="rounded-md bg-ink px-4 py-3 text-sm font-bold text-white" href={`${exportBase}&format=csv`}>
              Export CSV
            </a>
            <a className="rounded-md border border-ink/20 bg-white px-4 py-3 text-sm font-bold" href={`${exportBase}&format=cala`}>
              Cala JSON
            </a>
            <a className="rounded-md border border-ink/20 bg-white px-4 py-3 text-sm font-bold" href={`${exportBase}&format=pixverse`}>
              PixVerse JSON
            </a>
          </div>
        </AdminPageHeader>
        <p className="-mt-3 max-w-2xl text-sm font-semibold text-muted">
          Conversion, role performance, market health, Cala context packs, and PixVerse-ready promo briefs.
        </p>
        <Card className="bg-paper">
          <p className="text-sm font-bold text-muted">Operating on event</p>
          <h2 className="mt-1 text-xl font-black">{report.event.name}</h2>
          <p className="mt-1 text-xs font-semibold text-muted">Exports and analytics are scoped to this event.</p>
        </Card>

        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Scanned" value={report.funnel.scanned} />
          <Stat label="Predicted" value={report.funnel.predicted} />
          <Stat label="Scan to prediction" value={pct(report.funnel.scanToPredictionRate)} />
          <Stat label="Checkout conversion" value={pct(report.funnel.checkoutRate)} />
          <Stat label="Prediction actions" value={report.overview.predictionsSubmitted} />
          <Stat label="Committed" value={mbucks(report.overview.creditsCommitted)} />
          <Stat label="Virtual provision" value={mbucks(report.overview.virtualProvisionCredits)} />
          <Stat label="Resolved markets" value={report.funnel.resolvedWinners} />
        </section>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black">Role performance</h2>
            <StatusPill>{report.event.stageMode}</StatusPill>
          </div>
          <div className="grid gap-2">
            {report.rolePerformance.map((role) => (
              <div key={role.role} className="grid gap-2 rounded-xl bg-paper p-3 md:grid-cols-[180px_repeat(5,minmax(0,1fr))] md:items-center">
                <strong>{role.label}</strong>
                <span className="text-sm font-bold">{role.humans} humans</span>
                <span className="text-sm font-bold">{role.predictions} predictions</span>
                <span className="text-sm font-bold">{mbucks(role.committedCredits)} committed</span>
                <span className="text-sm font-bold">{credits(role.oracleScore)} score</span>
                <span className="min-w-0 break-words text-sm font-bold text-muted">{role.leadingOutcome}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-black">Market health</h2>
          <div className="mt-3 grid gap-2">
            {report.markets.map((market) => (
              <div key={market.id} className="grid gap-2 rounded-xl bg-paper p-3 lg:grid-cols-[1fr_110px_120px_140px_1fr] lg:items-center">
                <span className="min-w-0">
                  <strong className="break-words">{market.title}</strong>
                  <span className="font-mono-vota block text-[10px] font-bold uppercase text-faded">{market.category}</span>
                </span>
                <StatusPill>{market.status}</StatusPill>
                <span className="text-sm font-bold">{market.people} people</span>
                <span className="text-sm font-bold">{mbucks(market.signalCredits)} signal</span>
                <span className="min-w-0 break-words text-sm font-bold text-muted">
                  People: {market.topPeopleOutcome} | MegaBuck Signal: {market.topCreditOutcome}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-xl font-black">Cala context enrichment</h2>
            <div className="mt-3 grid gap-3">
              {report.calaContextPacks.slice(0, 3).map((pack) => (
                <div key={pack.marketId} className="rounded-xl bg-paper p-3">
                  <div className="font-black">{pack.title}</div>
                  <p className="mt-1 text-sm font-semibold text-muted">{pack.roomThesis}</p>
                  <p className="font-mono-vota mt-2 text-[10px] font-bold uppercase text-faded">{pack.roleSplit}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="text-xl font-black">PixVerse promo briefs</h2>
            <div className="mt-3 grid gap-3">
              {report.pixVersePromoBriefs.slice(0, 3).map((brief) => (
                <div key={brief.marketId} className="rounded-xl bg-paper p-3">
                  <div className="font-black">{brief.title}</div>
                  <p className="mt-1 text-sm font-semibold text-muted">{brief.prompt}</p>
                  <p className="font-mono-vota mt-2 text-[10px] font-bold uppercase text-faded">{brief.onScreenText.join(" / ")}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </Container>
    </Shell>
  );
}
