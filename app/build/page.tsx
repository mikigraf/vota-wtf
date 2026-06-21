import Link from "next/link";
import { ButtonLink, Card, Container, DisplayTitle, Kicker, PublicTopBar, Shell, Stat, StatusPill } from "@/components/ui";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { dashboardMetrics, leaderboardGroups, publicState } from "@/lib/store";
import { euro, mbucks } from "@/lib/utils";

export const dynamic = "force-dynamic";

const posts = [
  "Friday night: We are turning MEGATHON into a live market of belief.",
  "Saturday morning: QR join + prediction cards shipped.",
  "Saturday afternoon: Mollie test checkout MegaBucks now work.",
  "Saturday night: Whale Guard prevents one oversized signal from hijacking the room.",
  "Sunday: Humans vs agents at the final ceremony."
];

const proofLinks = [
  {
    title: "Public repo / commit",
    href: process.env.NEXT_PUBLIC_PROOF_REPO_URL,
    detail: "Repository or commit permalink for the submitted build."
  },
  {
    title: "Public posts thread",
    href: process.env.NEXT_PUBLIC_PROOF_POSTS_URL,
    detail: "4-6 public build-in-public posts from the MEGATHON weekend."
  },
  {
    title: "Demo clip",
    href: process.env.NEXT_PUBLIC_PROOF_DEMO_URL,
    detail: "Short clip of QR join, prediction, checkout, admin resolve, and stage reveal."
  },
  {
    title: "Checkout screenshot",
    href: process.env.NEXT_PUBLIC_PROOF_CHECKOUT_URL,
    detail: "Mollie test checkout and credited wallet evidence."
  },
  {
    title: "Admin screenshot",
    href: process.env.NEXT_PUBLIC_PROOF_ADMIN_URL,
    detail: "Dashboard metrics, market lifecycle, and audit log evidence."
  },
  {
    title: "Stage screenshot",
    href: process.env.NEXT_PUBLIC_PROOF_STAGE_URL,
    detail: "Big-screen live signal or resolution reveal evidence."
  }
];

export default async function BuildPage() {
  const store = await readDataStore();
  const metrics = dashboardMetrics(store, DEFAULT_EVENT_SLUG);
  const state = publicState(store, DEFAULT_EVENT_SLUG);
  const groups = leaderboardGroups(store, DEFAULT_EVENT_SLUG);
  const proofItems = [
    {
      title: "QR join flow",
      status: metrics.totalParticipants > 0 ? "Live" : "Ready",
      detail: `${metrics.totalParticipants} participant profiles created`,
      href: `/join/${DEFAULT_EVENT_SLUG}`
    },
    {
      title: "Prediction cards",
      status: `${state.markets.length} public`,
      detail: `${metrics.activeMarkets} open and ${metrics.predictionsSubmitted} prediction actions recorded`,
      href: `/e/${DEFAULT_EVENT_SLUG}`
    },
    {
      title: "Mollie test checkout",
      status: `${metrics.testCheckouts.completed} credited`,
      detail: `${mbucks(metrics.testCheckouts.creditsIssued)} issued, projected ${euro(metrics.testCheckouts.projectedEur)}`,
      href: "/admin/payments"
    },
    {
      title: "Whale Guard economics",
      status: mbucks(metrics.virtualProvisionCredits),
      detail: `${mbucks(metrics.creditsCommitted)} committed with 2% virtual provision tracked`,
      href: "/admin"
    },
    {
      title: "Stage screen",
      status: metrics.event.stageMode,
      detail: `Featured market: ${state.markets.find((market) => market.id === metrics.event.featuredMarketId)?.title || state.markets[0]?.title || "None yet"}`,
      href: `/stage/${DEFAULT_EVENT_SLUG}`
    },
    {
      title: "Oracle leaderboard",
      status: `${groups.overall.filter((row) => row.oracleScore > 0).length} scored`,
      detail: `Top oracle: ${groups.overall[0]?.nickname || "pending first resolution"}`,
      href: `/e/${DEFAULT_EVENT_SLUG}`
    }
  ];

  return (
    <Shell flush>
      <PublicTopBar eventCode="BUILD·PROOF" />
      <Container className="grid gap-6 px-5 py-10">
        <header>
          <Kicker>Build in public</Kicker>
          <DisplayTitle className="mt-2 text-5xl">vota.wtf TAG proof</DisplayTitle>
          <p className="mt-3 max-w-2xl font-semibold leading-6 text-muted">
            Public proof checklist for the MEGATHON weekend: commits, screenshots, checkout proof, admin resolution, and stage screen.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/build/demo" variant="secondary">Open operator demo script</ButtonLink>
            <ButtonLink href="/admin/readiness" variant="secondary">Open admin readiness</ButtonLink>
          </div>
        </header>
        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Participants" value={metrics.totalParticipants} />
          <Stat label="Prediction actions" value={metrics.predictionsSubmitted} />
          <Stat label="Committed" value={mbucks(metrics.creditsCommitted)} />
          <Stat label="Test checkout value" value={euro(metrics.testCheckouts.projectedEur)} />
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          {proofItems.map((item) => (
            <Link key={item.title} href={item.href} className="group">
              <Card className="h-full transition group-hover:-translate-y-0.5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h2 className="text-xl font-black">{item.title}</h2>
                  <StatusPill>{item.status}</StatusPill>
                </div>
                <p className="text-sm font-semibold text-muted">{item.detail}</p>
              </Card>
            </Link>
          ))}
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          {proofLinks.map((item) => (
            <Card key={item.title}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-xl font-black">{item.title}</h2>
                <StatusPill>{item.href ? "Linked" : "Pending"}</StatusPill>
              </div>
              <p className="text-sm font-semibold text-muted">{item.detail}</p>
              {item.href ? (
                <Link className="mt-4 inline-flex text-sm font-black text-ember" href={item.href}>
                  Open proof
                </Link>
              ) : null}
            </Card>
          ))}
        </section>
        <Card>
          <h2 className="text-xl font-black">Post plan</h2>
          <div className="mt-3 grid gap-2">
            {posts.map((post) => (
              <div key={post} className="rounded-xl bg-paper p-3 text-sm font-bold">
                {post}
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </Shell>
  );
}
