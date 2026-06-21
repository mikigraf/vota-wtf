import { AdminNav } from "@/components/admin-nav";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MarketForm, ResolveForm } from "@/components/market-form";
import { AdminPageHeader, ButtonLink, Card, Container, Shell, Stat } from "@/components/ui";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
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
  searchParams: Promise<{ error?: string | string[]; eventSlug?: string | string[] }>;
}) {
  const { id } = await params;
  const paramsValue = await searchParams;
  const error = firstSearchParam(paramsValue.error);
  const requestedEventSlug = firstSearchParam(paramsValue.eventSlug) || DEFAULT_EVENT_SLUG;
  const store = await readDataStore();
  const market = store.markets.find((item) => item.id === id);
  const event = market ? store.events.find((item) => item.id === market.eventId) : undefined;
  const fallbackEvent = store.events.find((item) => item.slug === requestedEventSlug) || store.events.find((item) => item.slug === DEFAULT_EVENT_SLUG) || store.events[0];
  if (!market) {
    return (
      <Shell className="bg-admin">
        <Container className="grid gap-6">
          <AdminNav eventSlug={fallbackEvent?.slug} />
          <Card className="grid gap-4">
            <div>
              <h1 className="text-2xl font-black">Market not found</h1>
              <p className="mt-2 text-sm font-bold text-muted">
                This admin link points to a market that no longer exists or is not available in this environment.
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
  const outcomes = store.outcomes.filter((outcome) => outcome.marketId === market.id);
  const aggregate = getAggregate(store, market.id);
  const activeParticipantIds = new Set(store.participants.filter((participant) => !participant.isBanned).map((participant) => participant.id));
  const accruedProvisionCredits = market.status === "voided"
    ? 0
    : store.positions
        .filter((position) => position.marketId === market.id && activeParticipantIds.has(position.participantId))
        .reduce((sum, position) => sum + position.feeCredits, 0);
  const settledPlatformProvisionCredits = store.ledgerEntries
    .filter((entry) => entry.marketId === market.id && entry.type === "platform_provision")
    .reduce((sum, entry) => sum + entry.amountCredits, 0);
  const platformProvisionCredits = market.status === "resolved" ? settledPlatformProvisionCredits : accruedProvisionCredits;
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
          <Stat label="Platform provision" value={mbucks(platformProvisionCredits)} />
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
    <form action={`/api/admin/markets/${marketId}/${action}`} method="post" className={danger ? "flex flex-wrap items-center gap-2" : undefined}>
      {action === "void" ? (
        <input
          aria-label="Type VOID to confirm"
          className="focus-ring h-11 w-28 rounded-full border border-danger/40 bg-white px-3 text-center text-sm font-black uppercase text-ink"
          name="confirmVoid"
          placeholder="VOID"
          disabled={disabled}
          autoComplete="off"
        />
      ) : null}
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
