import { AdminLiveRefresh } from "@/components/admin-live-refresh";
import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, Card, Container, Shell, Stat, StatusPill } from "@/components/ui";
import { resolveAdminEvent } from "@/lib/admin-events";
import { readinessContractData, readDataStore } from "@/lib/data";
import { buildReadinessReportWithLiveChecks, type ReadinessStatus } from "@/lib/readiness";
import { firstSearchParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

const statusClasses: Record<ReadinessStatus, string> = {
  pass: "bg-mint text-ink",
  warn: "bg-warn text-ink",
  fail: "bg-danger text-white"
};

export default async function AdminReadinessPage({
  searchParams
}: {
  searchParams: Promise<{ eventSlug?: string | string[] }>;
}) {
  const store = await readDataStore();
  const { event, requestedSlug, usedFallback } = resolveAdminEvent(store, firstSearchParam((await searchParams).eventSlug));
  const eventSlug = event?.slug || requestedSlug;
  const contract = await readinessContractData().catch((error) => ({
    ok: false,
    contractVersion: error instanceof Error ? error.message : "contract read failed"
  }));
  const report = await buildReadinessReportWithLiveChecks(store, process.env, eventSlug, fetch, contract);
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={eventSlug} />
        <AdminPageHeader kicker="Deployment readiness" title="Sunday proof checklist">
          <AdminLiveRefresh />
        </AdminPageHeader>
        {usedFallback ? (
          <Card className="border-warn bg-warn/15">
            <p className="text-sm font-bold text-ink">Event not found: {requestedSlug}. Showing {event?.name || eventSlug} instead.</p>
          </Card>
        ) : null}
        <p className="-mt-3 max-w-2xl text-sm font-semibold text-muted">
          Admin-only checks for launch configuration, event data, public evidence links, and optional external integrations.
        </p>
        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Ready" value={report.ready ? "Yes" : "No"} />
          <Stat label="Passing" value={report.counts.pass} />
          <Stat label="Warnings" value={report.counts.warn} />
          <Stat label="Failures" value={report.counts.fail} />
        </section>
        <section className="grid gap-4">
          {report.groups.map((group) => (
            <Card key={group.title}>
              <h2 className="text-xl font-black">{group.title}</h2>
              <div className="mt-3 grid gap-2">
                {group.checks.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-xl bg-paper p-3 md:grid-cols-[160px_1fr_auto] md:items-center">
                    <span className={`font-mono-vota inline-flex w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClasses[item.status]}`}>
                      {item.status}
                    </span>
                    <span className="min-w-0">
                      <strong className="block break-words">{item.label}</strong>
                      <span className="block break-words text-sm font-semibold text-muted">{item.detail}</span>
                    </span>
                    {item.href ? (
                      <a className="text-sm font-black text-ember" href={item.href}>
                        Open
                      </a>
                    ) : (
                      <StatusPill>{item.status}</StatusPill>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </section>
      </Container>
    </Shell>
  );
}
