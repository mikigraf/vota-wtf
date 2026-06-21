import { ShareReceiptButton } from "@/components/share-receipt-button";
import { ButtonLink, Container, Kicker, Shell } from "@/components/ui";
import { readReceiptStoreData } from "@/lib/data";
import { buildReceiptPromo } from "@/lib/promo";

export const dynamic = "force-dynamic";

export default async function ReceiptPromoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await readReceiptStoreData(id);
  const promo = buildReceiptPromo(store, id);
  const eventSlug = promo.eventSlug;
  return (
    <Shell className="overflow-hidden bg-ink text-white" flush>
      <Container className="max-w-5xl px-3 py-3 sm:px-5 sm:py-6">
        <style>{`
          @keyframes promo-rise {
            0% { opacity: 0; transform: translateY(28px) scale(0.98); }
            15%, 80% { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0.2; transform: translateY(-10px) scale(1.01); }
          }
          @keyframes signal-sweep {
            0% { transform: translateX(-80%); }
            100% { transform: translateX(120%); }
          }
          .promo-frame { animation: promo-rise 5.5s ease-in-out infinite both; }
          .promo-frame:nth-child(2) { animation-delay: 1.2s; }
          .promo-frame:nth-child(3) { animation-delay: 2.4s; }
          .signal-sweep { animation: signal-sweep 4s linear infinite; }
        `}</style>
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2 sm:py-4">
          <div className="min-w-0">
            <Kicker className="text-mint">vota.wtf receipt cut</Kicker>
            <h1 className="font-expanded mt-1 min-w-0 break-words text-2xl font-black leading-none [overflow-wrap:anywhere] sm:mt-2 sm:text-7xl">{promo.title}</h1>
            <p className="mt-2 hidden max-w-2xl break-words text-lg font-bold text-white/65 [overflow-wrap:anywhere] sm:block">{promo.subtitle}</p>
          </div>
          <ButtonLink href={`/e/${eventSlug}`} variant="secondary" className="min-h-11 px-4 text-xs sm:text-sm">Back</ButtonLink>
        </header>
        <section className="relative mt-3 min-h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#101315] p-3 shadow-stage sm:mt-8 sm:min-h-[560px] sm:p-5">
          <div className="signal-sweep absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-mint/25 to-transparent" />
          <div className="relative grid min-h-[294px] content-center gap-3 sm:min-h-[520px] sm:gap-5">
            {promo.frames.map((frame) => (
              <div key={`${frame.kicker}-${frame.headline}`} className="promo-frame min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur sm:p-5">
                <Kicker className="text-mint">{frame.kicker}</Kicker>
                <h2 className="font-expanded mt-2 min-w-0 break-words text-2xl font-black [overflow-wrap:anywhere] sm:text-6xl">{frame.headline}</h2>
                <p className="mt-2 min-w-0 break-words text-sm font-bold text-white/70 [overflow-wrap:anywhere] sm:mt-3 sm:text-lg">{frame.detail}</p>
              </div>
            ))}
          </div>
        </section>
        <p className="mt-5 hidden min-w-0 break-words rounded-xl bg-white/10 p-4 text-sm font-bold text-white/75 [overflow-wrap:anywhere] sm:block">{promo.shareCopy}</p>
        <div className="sticky bottom-2 z-20 mt-3 grid min-w-0 gap-2 overflow-hidden rounded-2xl bg-ink/95 p-2 shadow-stage sm:static sm:mt-4 sm:max-w-xs sm:bg-transparent sm:p-0 sm:shadow-none">
          <ShareReceiptButton text={promo.shareCopy} />
          <ButtonLink href={`/e/${eventSlug}`} variant="secondary" className="sm:hidden">Back to vota.wtf</ButtonLink>
        </div>
      </Container>
    </Shell>
  );
}
