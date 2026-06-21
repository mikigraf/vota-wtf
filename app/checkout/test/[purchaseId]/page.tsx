import { ButtonLink, Card, Container, Kicker, PublicTopBar, Shell } from "@/components/ui";
import { DEFAULT_EVENT_SLUG, TEST_CHECKOUT_CREDITS } from "@/lib/constants";
import { findPurchaseData, readDataStore, scopedCheckoutReturnPathData } from "@/lib/data";

export default async function LocalCheckoutPage({
  params,
  searchParams
}: {
  params: Promise<{ purchaseId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { purchaseId } = await params;
  const search = await searchParams;
  const requestedReturnTo = Array.isArray(search.returnTo) ? search.returnTo[0] : search.returnTo;
  const purchase = await findPurchaseData(purchaseId);
  const store = purchase ? await readDataStore() : undefined;
  const participant = purchase ? store?.participants.find((item) => item.id === purchase.participantId) : undefined;
  const event = participant ? store?.events.find((item) => item.id === participant.eventId) : undefined;
  const eventSlug = event?.slug || DEFAULT_EVENT_SLUG;
  const returnTo = await scopedCheckoutReturnPathData(requestedReturnTo || purchase?.returnTo, eventSlug);
  const returnSeparator = returnTo.includes("?") ? "&" : "?";
  const returnHref = purchase ? `${returnTo}${returnSeparator}checkout=${encodeURIComponent(purchase.id)}` : `/e/${eventSlug}`;
  const canComplete = purchase && participant && event && (purchase.status === "pending" || purchase.status === "paid");
  return (
    <Shell flush>
      <PublicTopBar eventCode="TEST·CHECKOUT" />
      <Container className="grid min-h-[calc(100dvh-64px)] place-items-center px-5 py-10">
        <Card className="w-full max-w-lg border-ink">
          <Kicker>Mollie test-mode simulator</Kicker>
          {canComplete ? (
            <>
              <h1 className="font-expanded mt-2 text-3xl font-black">Complete test checkout</h1>
              <p className="mt-3 text-sm font-semibold leading-5 text-muted">
                Local development has no Mollie key configured, so this page simulates the paid webhook. The wallet is credited only by the webhook route.
              </p>
              <form action="/api/payments/mollie/webhook" method="post" className="mt-6 grid gap-3">
                <input type="hidden" name="purchaseId" value={purchase.id} />
                <input type="hidden" name="redirectToEvent" value="1" />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="focus-ring min-h-12 rounded-full bg-ink px-4 text-sm font-black text-white">
                  Mark test payment paid (+{TEST_CHECKOUT_CREDITS} MBucks)
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-expanded mt-2 text-3xl font-black">Checkout link closed</h1>
              <p className="mt-3 text-sm font-semibold leading-5 text-muted">
                This test checkout is no longer pending. Return to the room and start a new top-up if you still need more MegaBucks.
              </p>
              <div className="mt-6">
                <ButtonLink href={returnHref}>Return to room</ButtonLink>
              </div>
            </>
          )}
        </Card>
      </Container>
    </Shell>
  );
}
