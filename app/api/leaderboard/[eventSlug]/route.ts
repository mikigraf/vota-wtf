import { readLeaderboardGroupsData } from "@/lib/data";
import { badRequest, json } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  try {
    const groups = await readLeaderboardGroupsData(eventSlug);
    return json({ leaderboard: groups.overall, groups });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unknown event:")) {
      return badRequest("Event not found.", 404);
    }
    throw error;
  }
}
