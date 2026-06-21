import { AdminLiveRefresh } from "@/components/admin-live-refresh";
import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, Card, Container, Select, Shell, SubmitButton, TextInput } from "@/components/ui";
import { DEFAULT_EVENT_SLUG, ROLE_LABELS } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { listParticipants } from "@/lib/participants";
import { firstSearchParam } from "@/lib/search-params";
import { credits, mbucks } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ParticipantsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string | string[]; role?: string | string[]; eventSlug?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const store = await readDataStore();
  const rawQuery = firstSearchParam(params.q) || "";
  const role = firstSearchParam(params.role) || "all";
  const eventSlug = firstSearchParam(params.eventSlug) || DEFAULT_EVENT_SLUG;
  const error = firstSearchParam(params.error);
  const participants = listParticipants(store, { eventSlug, q: rawQuery, role });
  const exportParams = new URLSearchParams({ format: "csv", eventSlug });
  if (rawQuery) exportParams.set("q", rawQuery);
  if (role !== "all") exportParams.set("role", role);
  const contextFields = (
    <>
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="q" value={rawQuery} />
      <input type="hidden" name="role" value={role} />
    </>
  );
  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={eventSlug} />
        <AdminPageHeader kicker="Moderation" title="Participants">
          <div className="flex flex-wrap items-center gap-2">
            <AdminLiveRefresh />
            <a className="rounded-md bg-ink px-4 py-3 text-sm font-bold text-white" href={`/api/admin/participants?${exportParams.toString()}`}>
              Export CSV
            </a>
          </div>
        </AdminPageHeader>
        {error ? (
          <div className="rounded-xl border border-ember bg-ember/10 p-3 text-sm font-bold text-ember">
            Participant update failed: {error}
          </div>
        ) : null}
        <Card>
          <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]" action="/admin/participants">
            <input type="hidden" name="eventSlug" value={eventSlug} />
            <TextInput name="q" placeholder="Search nickname" defaultValue={rawQuery} />
            <Select name="role" defaultValue={role}>
              <option value="all">All roles</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <SubmitButton>Filter</SubmitButton>
          </form>
        </Card>
        <Card>
          <div className="grid gap-3">
            {participants.map((participant) => {
              const wallet = store.wallets.find((item) => item.participantId === participant.id);
              return (
                <div key={participant.id} className="grid gap-3 rounded-xl bg-paper p-3 lg:grid-cols-[72px_1fr_auto] lg:items-center">
                  {participant.avatarUrl && !participant.isAvatarHidden ? (
                    <img src={participant.avatarUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  ) : (
                    <div className="font-expanded flex h-16 w-16 items-center justify-center rounded-xl bg-ink text-xl font-black text-white">
                      {participant.nickname.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-black">{participant.nickname}</div>
                    <div className="text-sm font-semibold text-muted">
                      {participant.role} | {participant.participantType} | wallet {mbucks(wallet?.balanceCredits || 0)} | score {credits(participant.oracleScore)}
                    </div>
                    <div className="font-mono-vota text-[10px] font-bold uppercase text-faded">
                      {participant.isBanned ? "Banned" : "Active"} | {participant.isAvatarHidden ? "Avatar hidden" : "Avatar visible"}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <form action="/api/admin/participants" method="post" className="flex gap-2">
                      {contextFields}
                      <input type="hidden" name="participantId" value={participant.id} />
                      <input type="hidden" name="action" value="rename" />
                      <TextInput name="nickname" defaultValue={participant.nickname} />
                      <SubmitButton>Rename</SubmitButton>
                    </form>
                    <ModerationButton
                      participantId={participant.id}
                      action={participant.isAvatarHidden ? "show_avatar" : "hide_avatar"}
                      label={participant.isAvatarHidden ? "Show avatar" : "Hide avatar"}
                      eventSlug={eventSlug}
                      q={rawQuery}
                      role={role}
                    />
                    <ModerationButton
                      participantId={participant.id}
                      action={participant.isBanned ? "unban" : "ban"}
                      label={participant.isBanned ? "Unban" : "Ban"}
                      danger={!participant.isBanned}
                      eventSlug={eventSlug}
                      q={rawQuery}
                      role={role}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </Container>
    </Shell>
  );
}

function ModerationButton({
  participantId,
  action,
  label,
  danger,
  eventSlug,
  q,
  role
}: {
  participantId: string;
  action: string;
  label: string;
  danger?: boolean;
  eventSlug: string;
  q: string;
  role: string;
}) {
  return (
    <form action="/api/admin/participants" method="post">
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="q" value={q} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton danger={danger}>{label}</SubmitButton>
    </form>
  );
}
