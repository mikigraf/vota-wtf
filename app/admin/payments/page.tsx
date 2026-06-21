import { AdminLiveRefresh } from "@/components/admin-live-refresh";
import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, Card, Container, Shell, Stat } from "@/components/ui";
import { resolveAdminEvent } from "@/lib/admin-events";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";
import { paymentMetrics } from "@/lib/store";
import { euro, mbucks } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams
}: {
  searchParams: Promise<{ reconciled?: string | string[]; credited?: string | string[]; status?: string | string[]; error?: string | string[]; eventSlug?: string | string[] }>;
}) {
  const params = await searchParams;
  const reconciled = firstSearchParam(params.reconciled);
  const credited = firstSearchParam(params.credited);
  const reconciledStatus = firstSearchParam(params.status);
  const error = firstSearchParam(params.error);
  const store = await readDataStore();
  const { event, requestedSlug, usedFallback } = resolveAdminEvent(store, firstSearchParam(params.eventSlug));
  if (!event) {
    return (
      <Shell className="bg-admin">
        <Container className="grid gap-6">
          <AdminNav />
          <Card>No events are configured yet.</Card>
        </Container>
      </Shell>
    );
  }
  const participantIds = new Set(store.participants.filter((participant) => participant.eventId === event?.id).map((participant) => participant.id));
  const purchases = store.purchases.filter((purchase) => participantIds.has(purchase.participantId));
  const checkoutIntents = store.checkoutIntents
    .filter((intent) => participantIds.has(intent.participantId))
    .sort((a, b) => b.lastClickedAt.localeCompare(a.lastClickedAt));
  const metrics = paymentMetrics(store, participantIds);
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={event.slug} />
        <AdminPageHeader kicker="Mollie test mode only" title="Test checkouts">
          <div className="flex flex-wrap items-center gap-2">
            <AdminLiveRefresh />
            <a className="rounded-md bg-ink px-4 py-3 text-sm font-bold text-white" href={`/api/admin/payments?format=csv&eventSlug=${encodeURIComponent(event.slug)}`}>
              Export purchases CSV
            </a>
            <a className="rounded-md bg-white px-4 py-3 text-sm font-bold text-ink" href={`/api/admin/payments?format=csv&type=intents&eventSlug=${encodeURIComponent(event.slug)}`}>
              Export intent CSV
            </a>
          </div>
        </AdminPageHeader>
        {usedFallback ? (
          <Card className="border-warn bg-warn/15">
            <p className="text-sm font-bold text-ink">Event not found: {requestedSlug}. Showing {event.name} instead.</p>
          </Card>
        ) : null}
        <Card className="bg-paper">
          <p className="text-sm font-bold text-muted">Operating on event</p>
          <h2 className="mt-1 text-xl font-black">{event.name}</h2>
          <p className="mt-1 text-xs font-semibold text-muted">Checkout intent and revenue projections are scoped to this event.</p>
        </Card>
        {error ? (
          <div className="rounded-xl border border-ember bg-ember/10 p-3 text-sm font-bold text-ember">
            Payment reconciliation failed: {error}
          </div>
        ) : null}
        {reconciled ? (
          <div className="rounded-xl border border-mint bg-mint/20 p-3 text-sm font-bold text-ink">
            Payment {reconciled} checked. Status: {reconciledStatus || "unknown"}. MegaBucks {credited === "1" ? "issued" : "unchanged"}.
          </div>
        ) : null}
        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Pending" value={metrics.byStatus.pending || 0} />
          <Stat label="Paid not credited" value={metrics.byStatus.paid || 0} />
          <Stat label="Credited" value={metrics.byStatus.credited || 0} />
          <Stat label="Failed / canceled" value={(metrics.byStatus.failed || 0) + (metrics.byStatus.canceled || 0)} />
          <Stat label="MegaBucks issued" value={mbucks(metrics.creditsIssued)} />
          <Stat label="Completed EUR value" value={euro(metrics.projectedEur)} />
          <Stat label="Interested people" value={metrics.intentCount} />
          <Stat label="Unique intent EUR" value={euro(metrics.intentProjectedEur)} />
          <Stat label="Top-up clicks" value={metrics.intentClicks} />
          <Stat label="Click intent EUR" value={euro(metrics.intentClickProjectedEur)} />
        </section>
        <Card>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono-vota text-[10px] font-bold uppercase tracking-[0.2em] text-faded">One row per participant</p>
              <h2 className="text-xl font-black text-ink">Checkout intent</h2>
            </div>
            <p className="text-sm font-bold text-faded">{metrics.intentClicks} total clicks, {euro(metrics.intentClickProjectedEur)} click value.</p>
          </div>
          <div className="grid gap-2">
            {checkoutIntents.length === 0 ? (
              <div className="rounded-xl bg-paper p-3 text-sm font-bold text-faded">No checkout button clicks yet.</div>
            ) : (
              checkoutIntents.map((intent) => {
                const participant = store.participants.find((item) => item.id === intent.participantId);
                const linkedPurchase = intent.purchaseId ? store.purchases.find((purchase) => purchase.id === intent.purchaseId) : undefined;
                return (
                  <div key={intent.id} className="grid gap-2 rounded-xl bg-paper p-3 md:grid-cols-[1fr_100px_110px_110px_130px_140px] md:items-center">
                    <span>
                      <strong>{participant?.nickname || intent.participantId}</strong>
                      <span className="font-mono-vota block text-[10px] font-bold uppercase text-faded">{participant?.email || "email unknown"}</span>
                    </span>
                    <span>{intent.clickCount} click{intent.clickCount === 1 ? "" : "s"}</span>
                    <span>{euro(intent.amountEur)} each</span>
                    <span>{euro(intent.amountEur * intent.clickCount)} total</span>
                    <span>{linkedPurchase?.status || "intent"}</span>
                    <span className="text-xs font-bold text-faded md:text-right">{new Date(intent.lastClickedAt).toLocaleTimeString()}</span>
                  </div>
                );
              })
            )}
          </div>
        </Card>
        <Card>
          <div className="grid gap-2">
            {purchases.map((purchase) => {
              const participant = store.participants.find((item) => item.id === purchase.participantId);
              const canReconcile = purchase.status === "pending" || purchase.status === "paid";
              return (
                <div key={purchase.id} className="grid gap-2 rounded-xl bg-paper p-3 md:grid-cols-[1fr_130px_120px_120px_120px] md:items-center">
                  <span>
                    <strong>{participant?.nickname || purchase.participantId}</strong>
                    <span className="font-mono-vota block text-[10px] font-bold uppercase text-faded">{purchase.molliePaymentId || purchase.id}</span>
                  </span>
                  <span>{purchase.status}</span>
                  <span>{mbucks(purchase.credits)}</span>
                  <span>{euro(purchase.amountEur)}</span>
                  {canReconcile ? (
                    <form action="/api/admin/payments/reconcile" method="post" className="md:justify-self-end">
                      <input type="hidden" name="purchaseId" value={purchase.id} />
                      <input type="hidden" name="eventSlug" value={event.slug} />
                      <button className="min-h-11 rounded-full bg-ink px-4 text-sm font-bold text-white" type="submit">
                        Verify
                      </button>
                    </form>
                  ) : (
                    <span className="text-sm font-bold text-faded md:text-right">Settled</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </Container>
    </Shell>
  );
}
