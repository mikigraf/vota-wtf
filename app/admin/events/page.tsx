import Link from "next/link";
import { AdminLiveRefresh } from "@/components/admin-live-refresh";
import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, ButtonLink, Card, Container, Shell, Stat, StatusPill } from "@/components/ui";
import { readDataStore } from "@/lib/data";
import { dashboardMetrics } from "@/lib/store";
import { mbucks } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const store = await readDataStore();
  const events = [...store.events].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={events[0]?.slug} />
        <AdminPageHeader kicker="All rooms" title="Events">
          <AdminLiveRefresh />
        </AdminPageHeader>
        <section className="grid gap-4 md:grid-cols-2">
          {events.map((event) => {
            const metrics = dashboardMetrics(store, event.slug);
            return (
              <Card key={event.id} className="grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono-vota text-[10px] font-bold uppercase tracking-[0.2em] text-faded">/{event.slug}</p>
                    <h2 className="mt-1 text-2xl font-black">{event.name}</h2>
                  </div>
                  <StatusPill>{event.status}</StatusPill>
                </div>
                <section className="grid grid-cols-2 gap-2">
                  <Stat label="Participants" value={metrics.totalParticipants} />
                  <Stat label="Markets" value={metrics.activeMarkets} />
                  <Stat label="Predictions" value={metrics.predictionsSubmitted} />
                  <Stat label="Committed" value={mbucks(metrics.creditsCommitted)} />
                </section>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={`/admin/events/${event.slug}`}>Manage</ButtonLink>
                  <ButtonLink href={`/admin?eventSlug=${encodeURIComponent(event.slug)}`} variant="secondary">
                    Dashboard
                  </ButtonLink>
                  <Link className="focus-ring inline-flex min-h-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-white px-4 text-sm font-black text-ink" href={`/e/${event.slug}`}>
                    Public room
                  </Link>
                </div>
              </Card>
            );
          })}
        </section>
      </Container>
    </Shell>
  );
}
