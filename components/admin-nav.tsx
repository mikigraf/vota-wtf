import Link from "next/link";
import { BrandMark } from "@/components/ui";

const links = [
  ["/admin", "Dashboard"],
  ["/admin/markets/new", "New market"],
  ["/admin/participants", "Participants"],
  ["/admin/payments", "Payments"],
  ["/admin/report", "Report"],
  ["/admin/readiness", "Readiness"],
  ["/admin/audit", "Audit"],
  ["/admin/stage", "Stage"],
  ["/admin/agents", "Agents"]
];

function scopedHref(href: string, eventSlug?: string) {
  if (!eventSlug || href === "/admin") return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}eventSlug=${encodeURIComponent(eventSlug)}`;
}

export function AdminNav({ eventSlug }: { eventSlug?: string }) {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-3 py-2 text-white">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Link href="/admin" className="mr-2 flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="font-mono-vota rounded-md border border-white/15 px-2 py-1 text-[9px] font-bold uppercase text-ember">Admin</span>
        </Link>
        {links.map(([href, label]) => (
          <Link key={href} href={scopedHref(href, eventSlug)} className="rounded-lg px-2.5 py-2 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white">
            {label}
          </Link>
        ))}
      </div>
      <form action="/api/admin/logout" method="post" className="flex items-center gap-3">
        <span className="font-mono-vota hidden items-center gap-2 text-[10px] font-bold uppercase text-white/45 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-warn" />
          Test mode
        </span>
        <button className="focus-ring rounded-lg border border-white/20 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/10">
          Logout
        </button>
      </form>
    </nav>
  );
}
