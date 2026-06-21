import { AdminNav } from "@/components/admin-nav";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MarketForm, ResolveForm } from "@/components/market-form";
import { AdminPageHeader, Card, Container, Shell, Stat } from "@/components/ui";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";
import { getAggregate } from "@/lib/store";
import { mbucks } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EditMarketPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { id } = await params;
  const error = firstSearchParam((await searchParams).error);
  const store = await readDataStore();
  const market = store.markets.find((item) => item.id === id);
  const event = market ? store.events.find((item) => item.id === market.eventId) : undefined;
  if (!market) {
    return (
      <Shell className="bg-admin">
        <Container className="grid gap-6">
          <AdminNav />
          <Card>Market not found.</Card>
        </Container>
      </Shell>
    );
  }
  const outcomes = store.outcomes.filter((outcome) => outcome.marketId === market.id);
  const aggregate = getAggregate(store, market.id);
  const activeParticipantIds = new Set(store.participants.filter((participant) => !participant.isBanned).map((participant) => participant.id));
  const virtualProvisionCredits = market.status === "voided"
    ? 0
    : store.positions
        .filter((position) => position.marketId === market.id && activeParticipantIds.has(position.participantId))
        .reduce((sum, position) => sum + position.feeCredits, 0);
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={event?.slug} />
        <AdminPageHeader kicker={market.status} title={market.title}>
          <div className="flex flex-wrap gap-2">
            <LifecycleButton action="open" marketId={market.id} label="Open market" disabled={market.status !== "draft"} />
            <LifecycleButton action="lock" marketId={market.id} label="Lock market" disabled={market.status !== "open"} />
            <LifecycleButton action="feature" marketId={market.id} label="Feature on stage" disabled={market.status === "draft" || market.status === "voided"} />
            <LifecycleButton action="void" marketId={market.id} label="Void" danger disabled={market.status === "voided" || market.status === "resolved"} />
          </div>
        </AdminPageHeader>
        {error ? (
          <Card className="border-danger bg-danger/10">
            <h2 className="text-lg font-black text-danger">Market action failed</h2>
            <p className="mt-1 text-sm font-bold text-muted">{error}</p>
          </Card>
        ) : null}
        <section className="grid gap-3 md:grid-cols-3">
          <Stat label="People Signal" value={aggregate.totalPeople} />
          <Stat label="Signal MegaBucks" value={mbucks(aggregate.totalSignalCredits)} />
          <Stat label="Virtual provision" value={mbucks(virtualProvisionCredits)} />
        </section>
        <Card>
          <MarketForm market={market} outcomes={outcomes} />
        </Card>
        <Card>
          <h2 className="mb-4 text-xl font-black">Resolve</h2>
          {market.status === "locked" ? (
            <ResolveForm market={market} outcomes={outcomes} />
          ) : (
            <p className="font-bold text-muted">
              {market.status === "resolved" ? "This market has already been resolved." : "Lock this market before resolving it."}
            </p>
          )}
        </Card>
      </Container>
    </Shell>
  );
}

function LifecycleButton({
  action,
  marketId,
  label,
  disabled,
  danger
}: {
  action: "open" | "lock" | "feature" | "void";
  marketId: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <form action={`/api/admin/markets/${marketId}/${action}`} method="post">
      <ConfirmSubmitButton
        data-testid={`admin-market-${action}-${marketId}`}
        disabled={disabled}
        danger={danger}
        message={`${label}? This affects the live ceremony state.`}
      >
        {label}
      </ConfirmSubmitButton>
    </form>
  );
}
