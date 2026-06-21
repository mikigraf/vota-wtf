import { DEFAULT_EVENT_SLUG } from "./constants";
import type { EventRecord, Store } from "./types";

export interface AdminEventSelection {
  event?: EventRecord;
  requestedSlug: string;
  usedFallback: boolean;
}

export function resolveAdminEvent(store: Pick<Store, "events">, requestedSlug?: string | null): AdminEventSelection {
  const requested = (requestedSlug || "").trim();
  const fallback = store.events.find((event) => event.slug === DEFAULT_EVENT_SLUG) || store.events[0];
  const event = (requested ? store.events.find((item) => item.slug === requested) : undefined) || fallback;
  return {
    event,
    requestedSlug: requested || DEFAULT_EVENT_SLUG,
    usedFallback: Boolean(requested && event && event.slug !== requested)
  };
}
