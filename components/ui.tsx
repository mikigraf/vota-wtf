import Link from "next/link";
import { cn } from "@/lib/utils";

export function Shell({
  children,
  className,
  flush = false
}: {
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <main className={cn("min-h-screen bg-white text-ink", flush ? "" : "px-4 py-6 sm:px-6 lg:px-8", className)}>
      {children}
    </main>
  );
}

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1180px]", className)}>{children}</div>;
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "orange" | "ghost";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold transition",
        variant === "primary" && "bg-ink text-white hover:bg-black",
        variant === "secondary" && "border-[1.5px] border-ink bg-white text-ink hover:bg-soft",
        variant === "orange" && "bg-ember text-ink hover:bg-ember/90",
        variant === "ghost" && "border border-line bg-white text-ink hover:bg-soft",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function SubmitButton({
  children,
  danger,
  className,
  disabled
}: {
  children: React.ReactNode;
  danger?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "bg-danger text-white hover:bg-danger/90" : "bg-ink text-white hover:bg-black",
        className
      )}
      type="submit"
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-line bg-white p-5", className)}>{children}</section>;
}

export function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-extrabold">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-xs font-semibold text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "focus-ring min-h-11 w-full rounded-[10px] border-[1.5px] border-line bg-white px-3.5 text-sm font-semibold text-ink placeholder:text-faded",
        props.className
      )}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "focus-ring min-h-24 w-full rounded-[10px] border-[1.5px] border-line bg-white px-3.5 py-3 text-sm font-semibold text-ink placeholder:text-faded",
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "focus-ring min-h-11 w-full rounded-[10px] border-[1.5px] border-line bg-white px-3.5 text-sm font-semibold text-ink",
        props.className
      )}
    />
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-4">
      <div className="font-mono-vota text-[10px] font-bold uppercase text-faded">{label}</div>
      <div className="mt-1 text-xl font-extrabold leading-tight md:text-2xl">{value}</div>
    </div>
  );
}

export function StatusPill({ children }: { children: React.ReactNode }) {
  const status = String(children).toLowerCase();
  const className =
    status.includes("open") || status.includes("live") || status.includes("pass") || status.includes("linked")
      ? "bg-mint text-ink"
      : status.includes("resolved") || status.includes("credited")
        ? "bg-ember text-ink"
      : status.includes("locked")
        ? "bg-soft text-ink"
      : status.includes("warn") || status.includes("pending") || status.includes("test")
        ? "bg-warn text-ink"
        : status.includes("fail") || status.includes("void") || status.includes("ban")
          ? "bg-danger text-white"
          : "bg-ink text-white";
  return (
    <span className={cn("font-mono-vota inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", className)}>
      {children}
    </span>
  );
}

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "sm" ? "h-6 w-6 rounded-md text-sm" : size === "lg" ? "h-11 w-11 rounded-xl text-2xl" : "h-8 w-8 rounded-lg text-xl";
  return (
    <span className={cn("font-expanded inline-flex shrink-0 items-center justify-center bg-ember font-black leading-none text-ink", dimensions)}>
      V
    </span>
  );
}

export function BrandLockup({ eventCode }: { eventCode?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <BrandMark />
      <span className="hidden text-lg font-extrabold text-white sm:inline">vota.wtf</span>
      {eventCode ? <span className="font-mono-vota hidden text-[10px] text-faded sm:inline">{eventCode}</span> : null}
    </div>
  );
}

export function PublicTopBar({
  eventCode,
  right
}: {
  eventCode?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="bg-ink text-white">
      <Container className="flex flex-nowrap items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-5 sm:py-3.5">
        <BrandLockup eventCode={eventCode} />
        {right ? <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:gap-3">{right}</div> : null}
      </Container>
    </div>
  );
}

export function LiveDot({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="font-mono-vota inline-flex items-center gap-2 text-[10px] font-bold uppercase text-mint">
      <span className="vota-pulse-dot h-2 w-2 rounded-full bg-mint" />
      {label}
    </span>
  );
}

export function Tape({ items }: { items: Array<{ label: string; value: React.ReactNode; tone?: "mint" | "ember" | "danger" | "white" }> }) {
  const repeated = [...items, ...items];
  return (
    <div className="overflow-hidden border-t border-white/10 bg-[#141416]">
      <div className="vota-marquee flex w-max whitespace-nowrap font-mono-vota text-xs font-bold">
        {repeated.map((item, index) => (
          <span key={`${item.label}-${index}`} className="border-r border-white/10 px-5 py-2.5 text-white">
            {item.label}{" "}
            <span
              className={cn(
                item.tone === "mint" && "text-mint",
                item.tone === "ember" && "text-ember",
                item.tone === "danger" && "text-danger",
                (!item.tone || item.tone === "white") && "text-white"
              )}
            >
              {item.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-mono-vota text-xs font-bold uppercase text-ember", className)}>{children}</p>;
}

export function DisplayTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h1 className={cn("font-expanded text-4xl font-black leading-none md:text-6xl", className)}>{children}</h1>;
}

export function AdminPageHeader({
  kicker,
  title,
  children
}: {
  kicker: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Kicker>{kicker}</Kicker>
        <h1 className="font-expanded mt-1 text-3xl font-black leading-tight md:text-[42px]">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}
