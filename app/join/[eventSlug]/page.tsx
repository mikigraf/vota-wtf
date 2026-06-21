import { JoinForm } from "@/components/join-form";
import { BrandMark, Card, Container, Kicker, PublicTopBar, Shell } from "@/components/ui";
import { PublicMissingLink } from "@/components/public-missing-link";
import { getParticipantSessionId } from "@/lib/auth";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { findEventBySlugData, getSessionParticipantData, scopedParticipantNextPathData } from "@/lib/data";
import { hasCompletedProfile } from "@/lib/participants";
import { firstSearchParam } from "@/lib/search-params";
import { redirect } from "next/navigation";

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
      <PublicMissingLink
        title="Room not found"
        message="This room link is not active. Use the main live room to get into the arena."
        href={`/join/${DEFAULT_EVENT_SLUG}`}
      />
    );
  }
  const session = await getSessionParticipantData(await getParticipantSessionId());
  const nextPath = await scopedParticipantNextPathData(firstSearchParam(search.next), eventSlug);
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
