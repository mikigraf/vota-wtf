import { DEFAULT_EVENT_SLUG } from "./constants";
import { isValidEmail } from "./utils";
import type { Participant, Role, Store } from "./types";

const ROLE_VALUES = new Set<Role>(["builder", "sponsor", "investor", "other"]);

export interface ParticipantFilters {
  eventSlug?: string;
  q?: string;
  role?: string;
}

export function listParticipants(store: Store, filters: ParticipantFilters = {}) {
  const eventSlug = filters.eventSlug || DEFAULT_EVENT_SLUG;
  const event = store.events.find((item) => item.slug === eventSlug);
  const query = (filters.q || "").trim().toLowerCase();
  const role = ROLE_VALUES.has(filters.role as Role) ? filters.role : "all";
  return store.participants.filter((participant) => {
    const matchesEvent = event ? participant.eventId === event.id : false;
    const matchesQuery = !query || participant.nickname.toLowerCase().includes(query);
    const matchesRole = role === "all" || participant.role === role;
    return matchesEvent && matchesQuery && matchesRole;
  });
}

export function isValidRole(value: string): value is Role {
  return ROLE_VALUES.has(value as Role);
}

export function hasCompletedProfile(participant?: Pick<Participant, "nickname" | "email" | "role"> | null) {
  if (!participant) return false;
  const nickname = participant.nickname.trim();
  return Boolean(nickname && nickname !== "oracle" && isValidEmail(participant.email || "") && isValidRole(participant.role));
}
