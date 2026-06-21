import Link from "next/link";
import { AdminLiveRefresh } from "@/components/admin-live-refresh";
import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, ButtonLink, Card, Container, Field, Select, Shell, Stat, StatusPill, SubmitButton, TextInput } from "@/components/ui";
import { DEFAULT_EVENT_SLUG, STARTER_CREDITS } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";
import { dashboardMetrics } from "@/lib/store";
import { baseUrl, mbucks } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const error = firstSearchParam((await searchParams).error);
  const store = await readDataStore();
  const events = [...store.events].sort((a, b) => a.name.localeCompare(b.name));
  const currentEventSlug = events.find((event) => event.slug === DEFAULT_EVENT_SLUG)?.slug || events[0]?.slug;
  const appBaseUrl = baseUrl().replace(/\/$/, "");
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={currentEventSlug} />
        <AdminPageHeader kicker="All rooms" title="Events">
          <AdminLiveRefresh />
        </AdminPageHeader>
        {error ? (
          <Card className="border-danger bg-danger/10">
            <h2 className="text-lg font-black text-danger">Event creation failed</h2>
            <p className="mt-1 text-sm font-bold text-muted">{error}</p>
          </Card>
        ) : null}
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Create event</h2>
              <p className="mt-1 text-sm font-semibold text-muted">Use this for a new room, rehearsal, or side stage.</p>
            </div>
          </div>
          <form action="/api/admin/events" method="post" className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_170px_150px_auto] md:items-end">
            <input type="hidden" name="returnTo" value="/admin/events" />
            <Field label="Event name">
              <TextInput name="name" required placeholder="Megathon finals" maxLength={80} />
            </Field>
            <Field label="URL slug" hint="Optional. Leave blank to generate.">
              <TextInput name="slug" placeholder="megathon-finals" maxLength={48} pattern="[a-zA-Z0-9 _.-]+" />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="live">
                <option value="live">Live</option>
                <option value="draft">Draft</option>
                <option value="paused">Paused</option>
                <option value="finished">Finished</option>
              </Select>
            </Field>
            <Field label="Starter MBucks">
              <TextInput name="starterCredits" type="number" min={100} max={1000000} step={100} defaultValue={STARTER_CREDITS} />
            </Field>
            <SubmitButton>Create</SubmitButton>
          </form>
        </Card>
        <section className="grid gap-4 md:grid-cols-2">
          {events.map((event) => {
            const metrics = dashboardMetrics(store, event.slug);
            const stageUrl = `${appBaseUrl}/stage/${event.slug}`;
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
                <div className="rounded-xl bg-paper p-3">
                  <p className="font-mono-vota text-[10px] font-bold uppercase text-faded">Stage URL</p>
                  <p className="mt-1 break-all font-mono-vota text-xs font-bold text-ink">{stageUrl}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={`/admin/events/${event.slug}`}>Manage</ButtonLink>
                  <ButtonLink href={`/admin?eventSlug=${encodeURIComponent(event.slug)}`} variant="secondary">
                    Dashboard
                  </ButtonLink>
                  <ButtonLink href={`/stage/${event.slug}`} variant="secondary">
                    Stage screen
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
