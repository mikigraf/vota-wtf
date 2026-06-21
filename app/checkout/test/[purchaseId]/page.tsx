import { Card, Container, Kicker, PublicTopBar, Shell } from "@/components/ui";
import { TEST_CHECKOUT_CREDITS } from "@/lib/constants";

export default async function LocalCheckoutPage({
  params,
  searchParams
}: {
  params: Promise<{ purchaseId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { purchaseId } = await params;
  const search = await searchParams;
  const returnTo = Array.isArray(search.returnTo) ? search.returnTo[0] : search.returnTo;
  return (
    <Shell flush>
      <PublicTopBar eventCode="TEST·CHECKOUT" />
      <Container className="grid min-h-[calc(100dvh-64px)] place-items-center px-5 py-10">
        <Card className="w-full max-w-lg border-ink">
          <Kicker>Mollie test-mode simulator</Kicker>
          <h1 className="font-expanded mt-2 text-3xl font-black">Complete test checkout</h1>
          <p className="mt-3 text-sm font-semibold leading-5 text-muted">
            Local development has no Mollie key configured, so this page simulates the paid webhook. The wallet is credited only by the webhook route.
          </p>
          <form action="/api/payments/mollie/webhook" method="post" className="mt-6 grid gap-3">
            <input type="hidden" name="purchaseId" value={purchaseId} />
            <input type="hidden" name="redirectToEvent" value="1" />
            {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
            <button className="focus-ring min-h-12 rounded-full bg-ink px-4 text-sm font-black text-white">
              Mark test payment paid (+{TEST_CHECKOUT_CREDITS} MBucks)
            </button>
          </form>
        </Card>
      </Container>
    </Shell>
  );
}
