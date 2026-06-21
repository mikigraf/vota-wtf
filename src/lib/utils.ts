type ClassValue = string | number | false | null | undefined | Record<string, boolean>;
export const CANONICAL_PUBLIC_BASE_URL = "https://vota.wtf";

export function cn(...inputs: ClassValue[]) {
  return inputs
    .flatMap((input) => {
      if (!input) return [];
      if (typeof input === "string" || typeof input === "number") return [String(input)];
      return Object.entries(input)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key);
    })
    .join(" ");
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix: string) {
  void prefix;
  return crypto.randomUUID();
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function credits(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function mbucks(value: number) {
  return `${credits(value)} MBucks`;
}

export function euro(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR"
  }).format(value);
}

export function cleanNicknameInput(input: string) {
  return input.replace(/[^\w .-]/g, "").trim().slice(0, 24);
}

export function normalizeNickname(input: string) {
  const cleaned = cleanNicknameInput(input);
  return cleaned || `oracle_${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function normalizeEmail(input: string) {
  return input.trim().toLowerCase().slice(0, 254);
}

export function isValidEmail(input: string) {
  const email = normalizeEmail(input);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEventSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function normalizeRole(input: string): "builder" | "sponsor" | "investor" | "other" {
  if (input === "builder" || input === "sponsor" || input === "investor") return input;
  return "other";
}

function trimmedPublicUrl(value?: string) {
  return value?.trim().replace(/\/$/, "") || "";
}

function shouldUseCanonicalProductionUrl(value: string) {
  if (!value) return true;
  try {
    const host = new URL(value).hostname;
    return host !== "vota.wtf";
  } catch {
    return true;
  }
}

export function baseUrl() {
  const configured = trimmedPublicUrl(process.env.NEXT_PUBLIC_BASE_URL);
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  if (process.env.NODE_ENV === "production") {
    return shouldUseCanonicalProductionUrl(configured) ? CANONICAL_PUBLIC_BASE_URL : configured;
  }
  return configured || vercel || "http://localhost:3000";
}

export function stageJoinUrl(eventSlug: string) {
  const normal = `${baseUrl()}/j/${eventSlug}`;
  if (new TextEncoder().encode(normal).length <= 134) return normal;
  const qrBase = process.env.NEXT_PUBLIC_QR_BASE_URL?.replace(/\/$/, "");
  if (!qrBase) return normal;
  return `${qrBase}/j/${eventSlug}`;
}

export function parseDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64")
  };
}
