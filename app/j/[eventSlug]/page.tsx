import { redirect } from "next/navigation";

export default async function ShortJoinPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  redirect(`/join/${eventSlug}`);
}
