import { JoinForm } from "@/components/join-form";
import { BrandMark, Card, Container, Kicker, PublicTopBar, Shell } from "@/components/ui";
import { getParticipantSessionId } from "@/lib/auth";
import { findEventBySlugData, getSessionParticipantData } from "@/lib/data";
import { hasCompletedProfile } from "@/lib/participants";
import { firstSearchParam } from "@/lib/search-params";
import { redirect } from "next/navigation";

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
  if (session?.participant.eventId === event.id && hasCompletedProfile(session.participant)) {
    redirect(nextPath || `/e/${eventSlug}`);
  }
  return (
    <Shell flush>
      <PublicTopBar eventCode={event.name.replace(/\s+/g, "·").toUpperCase()} />
      <Container className="grid min-h-[calc(100dvh-58px)] place-items-center px-3 py-3 sm:px-5 sm:py-10">
        <Card className="w-full max-w-xl border-ink p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <BrandMark />
            <Kicker>WTF does the room believe?</Kicker>
          </div>
          <h1 className="font-expanded mt-2 text-2xl font-black sm:mt-4 sm:text-4xl">Join the arena</h1>
          <p className="mt-3 hidden text-sm font-semibold leading-5 text-muted sm:block">
            Choose a unique stage name and add your email. Add a photo if you want; otherwise vota.wtf makes an avatar for you.
          </p>
          <div className="mt-3 sm:mt-6">
            <JoinForm
              eventSlug={eventSlug}
              initialNickname={session?.participant.nickname}
              initialEmail={session?.participant.email}
              initialAvatarUrl={session?.participant.avatarUrl}
              nextPath={nextPath}
            />
          </div>
        </Card>
      </Container>
    </Shell>
  );
}
