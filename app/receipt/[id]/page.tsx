import { BrandMark, ButtonLink, Card, Container, Kicker, PublicTopBar, Shell } from "@/components/ui";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readReceiptStoreData } from "@/lib/data";
import { participantReceipt } from "@/lib/store";
import { credits, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await readReceiptStoreData(id);
  const receipt = participantReceipt(store, id, id);
  const eventSlug =
    (receipt?.market ? store.events.find((event) => event.id === receipt.market?.eventId)?.slug : undefined) ||
    store.events[0]?.slug ||
    DEFAULT_EVENT_SLUG;
  return (
    <Shell flush>
      <PublicTopBar eventCode="RECEIPT" />
      <Container className="grid min-h-[calc(100vh-64px)] place-items-center px-5 py-10">
        <Card className="w-full max-w-2xl border-ink text-center">
          <div className="flex justify-center">
            <BrandMark size="lg" />
          </div>
          <Kicker className="mt-4">I called it</Kicker>
          {receipt?.market && receipt.outcome ? (
            <>
              <h1 className="font-expanded mt-3 break-words text-3xl font-black leading-tight sm:text-4xl">
                {receipt.participant.nickname} called {receipt.outcome.label} before the room did. You saw it first.
              </h1>
              <p className="mt-4 text-lg font-bold text-muted">
                Only {pct(receipt.peopleAtCall)} of people backed it when the take was locked.
              </p>
              <p className="font-expanded mt-6 break-words text-4xl font-black text-ember sm:text-5xl">+{credits(receipt.oracleScore)} Oracle Score</p>
              <div className="mt-6">
                <ButtonLink href={`/receipt/${id}/promo`} variant="secondary">Open animated receipt</ButtonLink>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-expanded mt-3 break-words text-3xl font-black sm:text-4xl">Receipt pending</h1>
              <p className="mt-4 text-lg font-bold text-muted">
                This profile needs a resolved correct prediction before the receipt can brag.
              </p>
            </>
          )}
          <div className="mt-8">
            <ButtonLink href={`/e/${eventSlug}`}>Back to vota.wtf</ButtonLink>
          </div>
        </Card>
      </Container>
    </Shell>
  );
}
