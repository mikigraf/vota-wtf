import { ButtonLink, Container, Kicker, Shell } from "@/components/ui";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readReceiptStoreData } from "@/lib/data";
import { buildReceiptPromo } from "@/lib/promo";

export const dynamic = "force-dynamic";

export default async function ReceiptPromoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await readReceiptStoreData(id);
  const promo = buildReceiptPromo(store, id);
  const eventSlug = store.events[0]?.slug || DEFAULT_EVENT_SLUG;
  return (
    <Shell className="overflow-hidden bg-ink text-white" flush>
      <Container className="max-w-5xl px-5 py-6">
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
        <header className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <Kicker className="text-mint">vota.wtf receipt cut</Kicker>
            <h1 className="font-expanded mt-2 break-words text-4xl font-black leading-none sm:text-7xl">{promo.title}</h1>
            <p className="mt-3 max-w-2xl break-words text-lg font-bold text-white/65">{promo.subtitle}</p>
          </div>
          <ButtonLink href={`/e/${eventSlug}`} variant="secondary">Back</ButtonLink>
        </header>
        <section className="relative mt-8 min-h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#101315] p-5 shadow-stage">
          <div className="signal-sweep absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-mint/25 to-transparent" />
          <div className="relative grid min-h-[520px] content-center gap-5">
            {promo.frames.map((frame) => (
              <div key={`${frame.kicker}-${frame.headline}`} className="promo-frame rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur">
                <Kicker className="text-mint">{frame.kicker}</Kicker>
                <h2 className="font-expanded mt-2 break-words text-4xl font-black sm:text-6xl">{frame.headline}</h2>
                <p className="mt-3 break-words text-lg font-bold text-white/70">{frame.detail}</p>
              </div>
            ))}
          </div>
        </section>
        <p className="mt-5 break-words rounded-xl bg-white/10 p-4 text-sm font-bold text-white/75">{promo.shareCopy}</p>
      </Container>
    </Shell>
  );
}
