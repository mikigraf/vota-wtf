import { JoinForm } from "@/components/join-form";
import { BrandMark, Card, Container, Kicker, PublicTopBar, Shell } from "@/components/ui";
import { getParticipantSessionId } from "@/lib/auth";
import { findEventBySlugData, getSessionParticipantData } from "@/lib/data";
import { hasCompletedProfile } from "@/lib/participants";
import { firstSearchParam } from "@/lib/search-params";

function safeNextPath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  if (value.startsWith("/admin") || value.startsWith("/api")) return "";
  return value;
}

export default async function JoinPage({
  params,
  searchParams
}: {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { eventSlug } = await params;
  const search = await searchParams;
  const event = await findEventBySlugData(eventSlug);
  if (!event) {
    return (
      <Shell>
        <Container>
          <Card>Event not found.</Card>
        </Container>
      </Shell>
    );
  }
  const session = await getSessionParticipantData(await getParticipantSessionId());
  const nextPath = safeNextPath(firstSearchParam(search.next));
  return (
    <Shell flush>
      <PublicTopBar eventCode={event.name.replace(/\s+/g, "·").toUpperCase()} />
      <Container className="grid min-h-[calc(100vh-64px)] place-items-center px-5 py-10">
        <Card className="w-full max-w-xl border-ink">
          <div className="flex items-center gap-3">
            <BrandMark />
            <Kicker>WTF does the room believe?</Kicker>
          </div>
          <h1 className="font-expanded mt-4 text-4xl font-black">Join the arena</h1>
          <p className="mt-3 text-sm font-semibold leading-5 text-muted">
            Choose a stage name and role. Add a photo if you want; otherwise vota.wtf makes an avatar for you.
          </p>
          <div className="mt-6">
            <JoinForm
              eventSlug={eventSlug}
              initialNickname={session?.participant.nickname}
              initialRole={session?.participant.role}
              initialAvatarUrl={session?.participant.avatarUrl}
              initialProfileComplete={hasCompletedProfile(session?.participant)}
              nextPath={nextPath}
            />
          </div>
        </Card>
      </Container>
    </Shell>
  );
}
