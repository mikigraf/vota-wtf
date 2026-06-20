import { StageView } from "@/components/stage-view";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readLeaderboardGroupsData, readPublicStateData } from "@/lib/data";
import { stageJoinUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StagePage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const slug = eventSlug || DEFAULT_EVENT_SLUG;
  const [state, groups] = await Promise.all([
    readPublicStateData(slug),
    readLeaderboardGroupsData(slug)
  ]);
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
