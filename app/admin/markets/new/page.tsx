import { AdminNav } from "@/components/admin-nav";
import { MarketForm } from "@/components/market-form";
import { Card, Container, Kicker, Shell } from "@/components/ui";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export default async function NewMarketPage({
  searchParams
}: {
  searchParams: Promise<{ eventSlug?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedSlug = firstSearchParam(params.eventSlug) || DEFAULT_EVENT_SLUG;
  const error = firstSearchParam(params.error);
  const store = await readDataStore();
  const eventSlug = store.events.some((event) => event.slug === requestedSlug) ? requestedSlug : DEFAULT_EVENT_SLUG;
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={eventSlug} />
        {error ? (
          <Card className="border-danger bg-danger/10">
            <h2 className="text-lg font-black text-danger">Market draft failed</h2>
            <p className="mt-1 text-sm font-bold text-muted">{error}</p>
          </Card>
        ) : null}
        <Card>
          <Kicker>Market builder</Kicker>
          <h1 className="font-expanded mt-2 text-4xl font-black">Create prediction</h1>
          <div className="mt-6">
            <MarketForm eventSlug={eventSlug} />
          </div>
        </Card>
      </Container>
    </Shell>
  );
}
