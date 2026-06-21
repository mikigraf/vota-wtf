import { ShareReceiptButton } from "@/components/share-receipt-button";
import { BrandMark, ButtonLink, Card, Container, Kicker, PublicTopBar, Shell } from "@/components/ui";
import { readReceiptStoreData } from "@/lib/data";
import { eventSlugForReceipt } from "@/lib/promo";
import { participantReceipt } from "@/lib/store";
import { credits, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await readReceiptStoreData(id);
  const receipt = participantReceipt(store, id, id);
  const eventSlug = eventSlugForReceipt(store, receipt);
  return (
    <Shell flush>
      <PublicTopBar eventCode="RECEIPT" />
      <Container className="grid min-h-[calc(100dvh-58px)] place-items-center px-3 py-3 sm:px-5 sm:py-10">
        <Card className="min-w-0 w-full max-w-2xl overflow-hidden border-ink p-4 text-center sm:p-5">
          <div className="hidden justify-center sm:flex">
            <BrandMark size="lg" />
          </div>
          <Kicker className="sm:mt-4">I called it</Kicker>
          {receipt?.market && receipt.outcome ? (
            <>
              <h1 className="font-expanded mt-2 min-w-0 break-words text-2xl font-black leading-tight [overflow-wrap:anywhere] sm:mt-3 sm:text-4xl">
                {receipt.participant.nickname} called {receipt.outcome.label} before the room did. You saw it first.
              </h1>
              <p className="mt-2 min-w-0 break-words text-sm font-bold text-muted [overflow-wrap:anywhere] sm:mt-4 sm:text-lg">
                Only {pct(receipt.peopleAtCall)} of people backed it when they made the call.
              </p>
              <p className="font-expanded mt-3 min-w-0 break-words text-3xl font-black text-ember [overflow-wrap:anywhere] sm:mt-6 sm:text-5xl">+{credits(receipt.oracleScore)} Oracle Score</p>
              <div className="sticky bottom-2 z-20 mt-4 grid min-w-0 gap-2 overflow-hidden rounded-2xl bg-white/95 p-2 shadow-panel sm:static sm:mt-6 sm:grid-cols-2 sm:bg-transparent sm:p-0 sm:shadow-none">
                <ShareReceiptButton text={`${receipt.participant.nickname} called ${receipt.outcome.label} before the room did on vota.wtf.`} />
                <ButtonLink href={`/e/${eventSlug}`}>Back to vota.wtf</ButtonLink>
                <ButtonLink href={`/receipt/${id}/promo`} variant="secondary" className="sm:hidden">Animated receipt</ButtonLink>
              </div>
              <ButtonLink href={`/receipt/${id}/promo`} variant="secondary" className="mt-3 hidden sm:inline-flex">Open animated receipt</ButtonLink>
            </>
          ) : (
            <>
              <h1 className="font-expanded mt-2 min-w-0 break-words text-2xl font-black [overflow-wrap:anywhere] sm:mt-3 sm:text-4xl">Receipt pending</h1>
              <p className="mt-2 min-w-0 break-words text-sm font-bold text-muted [overflow-wrap:anywhere] sm:mt-4 sm:text-lg">
                This profile needs a resolved correct prediction before this receipt can be shared.
              </p>
              <div className="sticky bottom-2 z-20 mt-4 min-w-0 overflow-hidden rounded-2xl bg-white/95 p-2 shadow-panel sm:static sm:bg-transparent sm:p-0 sm:shadow-none">
                <ButtonLink href={`/e/${eventSlug}`}>Back to vota.wtf</ButtonLink>
              </div>
            </>
          )}
        </Card>
      </Container>
    </Shell>
  );
}
