import { ButtonLink, Card, Container, DisplayTitle, Kicker, PublicTopBar, Shell, StatusPill } from "@/components/ui";
import { DEFAULT_EVENT_SLUG, LIVESTREAM_DEMO_EVENT_SLUG } from "@/lib/constants";

export const dynamic = "force-dynamic";

const DEFAULT_DEMO_MARKET_ID = "00000000-0000-4000-8000-000000001001";

const steps = [
  {
    title: "Open the preloaded livestream event",
    detail: "Use this if you need an already-active crowd: 37 seeded participants are spread across the example market.",
    href: `/e/${LIVESTREAM_DEMO_EVENT_SLUG}`
  },
  {
    title: "Put the livestream market on stage",
    detail: "Project the seeded demo event when the stream needs live-looking signal immediately.",
    href: `/stage/${LIVESTREAM_DEMO_EVENT_SLUG}`
  },
  {
    title: "Open the public event",
    detail: "Confirm the public market list, safe no-payout copy, and leaderboard panels are visible.",
    href: `/e/${DEFAULT_EVENT_SLUG}`
  },
  {
    title: "Open the stage screen",
    detail: `Put /stage/${DEFAULT_EVENT_SLUG} on the projector in Join QR mode before participants arrive.`,
    href: `/stage/${DEFAULT_EVENT_SLUG}`
  },
  {
    title: "Join from a phone",
    detail: "Scan the QR, enter a unique stage name and email, then enter the arena.",
    href: `/join/${DEFAULT_EVENT_SLUG}`
  },
  {
    title: "Place the first prediction",
    detail: "Use the fair-launch 100 MBucks prediction and confirm the stage advances into live mode.",
    href: `/m/${DEFAULT_DEMO_MARKET_ID}`
  },
  {
    title: "Add or switch",
    detail: "Wait for cooldown, then test an allowed add or switch and verify the current prediction receipt state.",
    href: `/m/${DEFAULT_DEMO_MARKET_ID}`
  },
  {
    title: "Try Whale Guard",
    detail: "Attempt an oversized custom amount and confirm the API returns the current max allowed amount.",
    href: `/m/${DEFAULT_DEMO_MARKET_ID}`
  },
  {
    title: "Run a test checkout",
    detail: "Create a Mollie test checkout from the public event page, return, and wait for verified crediting.",
    href: `/e/${DEFAULT_EVENT_SLUG}`
  },
  {
    title: "Review admin metrics",
    detail: "Check participants, predictions, virtual 2% provision, scan conversion, checkout totals, and audit state.",
    href: `/admin?eventSlug=${DEFAULT_EVENT_SLUG}`
  },
  {
    title: "Moderate a participant",
    detail: "Rename, hide avatar, ban, or unban a test participant and verify the audit log records it.",
    href: `/admin/participants?eventSlug=${DEFAULT_EVENT_SLUG}`
  },
  {
    title: "Lock the market",
    detail: "Use the market lifecycle controls to lock the market before judging starts.",
    href: `/admin/events/${DEFAULT_EVENT_SLUG}`
  },
  {
    title: "Resolve and score",
    detail: "Choose the winning outcome, resolve the market, and confirm Oracle Score and Top Oracles update.",
    href: `/admin/events/${DEFAULT_EVENT_SLUG}`
  },
  {
    title: "Show the reveal",
    detail: "Switch to resolution mode and verify the chosen outcome, crowd rank, and Top Oracles on stage.",
    href: `/stage/${DEFAULT_EVENT_SLUG}`
  },
  {
    title: "Capture proof",
    detail: "Record the demo clip and upload repo, checkout, admin, and stage evidence links into the proof env vars.",
    href: "/build"
  }
];

export default function DemoScriptPage() {
  return (
    <Shell flush>
      <PublicTopBar eventCode="OPERATOR·SCRIPT" />
      <Container className="grid gap-6 px-5 py-10">
        <header>
          <Kicker>Operator runbook</Kicker>
          <DisplayTitle className="mt-2 text-5xl">Live demo script</DisplayTitle>
          <p className="mt-3 max-w-2xl font-semibold leading-6 text-muted">
            A ceremony-safe sequence for proving QR join, prediction mechanics, Mollie test checkout, admin controls, and the stage reveal.
          </p>
        </header>
        <section className="grid gap-3">
          {steps.map((step, index) => (
            <Card key={step.title} className="grid gap-3 md:grid-cols-[72px_1fr_auto] md:items-center">
              <StatusPill>{String(index + 1).padStart(2, "0")}</StatusPill>
              <div>
                <h2 className="text-xl font-extrabold">{step.title}</h2>
                <p className="mt-1 text-sm font-semibold text-muted">{step.detail}</p>
              </div>
              <ButtonLink href={step.href} variant="secondary">Open</ButtonLink>
            </Card>
          ))}
        </section>
      </Container>
    </Shell>
  );
}
