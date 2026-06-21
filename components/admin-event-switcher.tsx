"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function AdminEventSwitcher({
  events,
  currentEventSlug
}: {
  events: Array<{ slug: string; name: string }>;
  currentEventSlug?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  if (events.length === 0) return null;

  function switchEvent(slug: string) {
    if (!slug) return;
    if (pathname === "/admin/events" || pathname.startsWith("/admin/events/")) {
      router.push(`/admin/events/${encodeURIComponent(slug)}`);
      return;
    }
    if (pathname.startsWith("/admin/markets/") && pathname !== "/admin/markets/new") {
      router.push(`/admin/events/${encodeURIComponent(slug)}`);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("eventSlug", slug);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-2 py-1.5 text-xs font-black uppercase text-white/70">
      Event
      <select
        className="focus-ring min-h-9 max-w-[180px] rounded-lg border border-white/20 bg-ink px-2 text-sm font-bold normal-case text-white"
        value={currentEventSlug || events[0]?.slug || ""}
        onChange={(event: { currentTarget: HTMLSelectElement }) => switchEvent(event.currentTarget.value)}
      >
        {events.map((event) => (
          <option key={event.slug} value={event.slug}>
            {event.name}
          </option>
        ))}
      </select>
    </label>
  );
}
