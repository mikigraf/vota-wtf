import { AdminNav } from "@/components/admin-nav";
import { AdminPageHeader, Card, Container, Select, Shell, SubmitButton, TextInput } from "@/components/ui";
import { resolveAdminEvent } from "@/lib/admin-events";
import { listAuditLogs, stringifyAuditDetails } from "@/lib/audit";
import { readDataStore } from "@/lib/data";
import { firstSearchParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams
}: {
  searchParams: Promise<{ action?: string | string[]; entityType?: string | string[]; q?: string | string[]; eventSlug?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = firstSearchParam(params.q);
  const action = firstSearchParam(params.action);
  const entityType = firstSearchParam(params.entityType);
  const store = await readDataStore();
  const { event, requestedSlug, usedFallback } = resolveAdminEvent(store, firstSearchParam(params.eventSlug));
  const eventSlug = event?.slug || requestedSlug;
  const logs = listAuditLogs(store, {
    action,
    entityType,
    eventSlug,
    q,
    limit: 250
  });
  const scopedLogs = listAuditLogs(store, { eventSlug, limit: 1000 });
  const actions = uniqueSorted(scopedLogs.map((log) => log.action));
  const entityTypes = uniqueSorted(scopedLogs.map((log) => log.entityType));
  const csvParams = new URLSearchParams();
  if (q) csvParams.set("q", q);
  if (action && action !== "all") csvParams.set("action", action);
  if (entityType && entityType !== "all") csvParams.set("entityType", entityType);
  if (eventSlug) csvParams.set("eventSlug", eventSlug);
  csvParams.set("format", "csv");

  return (
    <Shell className="bg-admin">
      <Container className="grid gap-6">
        <AdminNav eventSlug={eventSlug} />
        <AdminPageHeader kicker="Operator trail" title="Admin audit log">
          <a className="rounded-md bg-ink px-4 py-3 text-sm font-bold text-white" href={`/api/admin/audit?${csvParams.toString()}`}>
            Export CSV
          </a>
        </AdminPageHeader>
        {usedFallback ? (
          <Card className="border-warn bg-warn/15">
            <p className="text-sm font-bold text-ink">Event not found: {requestedSlug}. Showing {event?.name || eventSlug} instead.</p>
          </Card>
        ) : null}
        <Card>
          <form className="grid gap-3 md:grid-cols-[1fr_220px_220px_auto]" action="/admin/audit">
            {eventSlug ? <input type="hidden" name="eventSlug" value={eventSlug} /> : null}
            <TextInput name="q" placeholder="Search action, entity, details" defaultValue={q || ""} />
            <Select name="action" defaultValue={action || "all"}>
              <option value="all">All actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {formatAction(action)}
                </option>
              ))}
            </Select>
            <Select name="entityType" defaultValue={entityType || "all"}>
              <option value="all">All entities</option>
              {entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </Select>
            <SubmitButton>Filter</SubmitButton>
          </form>
        </Card>
        <Card className="bg-ink text-white">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-expanded text-xl font-black">Recent activity</h2>
              <p className="text-sm font-semibold text-white/55">
                Showing {logs.length} of {scopedLogs.length} recorded admin actions.
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            {logs.length === 0 ? <p className="text-sm font-bold text-white/55">No audit entries match these filters.</p> : null}
            {logs.map((log) => (
              <div key={log.id} className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 lg:grid-cols-[180px_1fr_220px]">
                <time className="font-mono-vota text-xs font-bold text-white/55" dateTime={log.createdAt}>
                  {formatDate(log.createdAt)}
                </time>
                <div className="min-w-0">
                  <div className="font-extrabold">{formatAction(log.action)}</div>
                  <pre className="font-mono-vota mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-2 text-xs font-semibold text-ink/70">{stringifyAuditDetails(log.details, 2)}</pre>
                </div>
                <div className="font-mono-vota min-w-0 rounded-xl border border-white/10 bg-white/10 p-2 text-[10px] font-bold uppercase text-white/60">
                  <div className="uppercase text-ember">{log.entityType}</div>
                  <div className="mt-1 break-all">{log.entityId}</div>
                  {log.ip ? <div className="mt-2 break-all">IP {log.ip}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </Shell>
  );
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function formatAction(action: string) {
  return action.replace(/_/g, " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
