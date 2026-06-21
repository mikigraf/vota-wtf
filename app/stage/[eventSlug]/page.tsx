import { StageView } from "@/components/stage-view";
import { Container, Shell } from "@/components/ui";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readLeaderboardGroupsData, readPublicStateData } from "@/lib/data";
import { stageJoinUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StagePage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const slug = eventSlug || DEFAULT_EVENT_SLUG;
  let state;
  let groups;
  try {
    [state, groups] = await Promise.all([
      readPublicStateData(slug),
      readLeaderboardGroupsData(slug)
    ]);
  } catch (error) {
    return (
      <Shell className="grid min-h-screen place-items-center bg-ink text-white" flush>
        <Container className="px-6 text-center">
          <p className="font-mono-vota text-xs font-bold uppercase text-mint">Stage reconnecting</p>
          <h1 className="font-expanded mt-4 text-4xl font-black sm:text-7xl">vota.wtf</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg font-bold text-white/70">
            Stage data is not available for {slug}. Keep the QR on screen and reopen the operator control room.
          </p>
          <p className="font-mono-vota mt-6 break-all text-sm font-bold text-ember">{stageJoinUrl(slug)}</p>
          <p className="mt-4 text-xs font-semibold text-white/45">
            {error instanceof Error ? error.message : "Unknown stage load error."}
          </p>
        </Container>
      </Shell>
    );
  }
  return (
    <StageView
      joinUrl={stageJoinUrl(slug)}
      initial={{
        ...state,
        leaderboard: groups.overall,
        leaderboardGroups: groups,
        roleWinners: state.roleWinners
      }}
    />
  );
}
