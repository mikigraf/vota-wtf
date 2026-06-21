import { redirect } from "next/navigation";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  redirect(`/join/${DEFAULT_EVENT_SLUG}`);
}
