import { NextRequest } from "next/server";
import { readPublicStateData } from "@/lib/data";
import { badRequest, json } from "@/lib/http";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const data = await readPublicStateData(slug);
    return json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=1, stale-while-revalidate=5"
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unknown event:")) {
      return badRequest("Event not found.", 404);
    }
    throw error;
  }
}
