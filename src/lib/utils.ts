type ClassValue = string | number | false | null | undefined | Record<string, boolean>;

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

export function normalizeNickname(input: string) {
  const cleaned = input.replace(/[^\w .-]/g, "").trim().slice(0, 24);
  return cleaned || `oracle_${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function normalizeRole(input: string): "builder" | "sponsor" | "investor" | "other" {
  if (input === "builder" || input === "sponsor" || input === "investor") return input;
  return "other";
}

export function baseUrl() {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  if (configured && process.env.NODE_ENV === "production") {
    try {
      const host = new URL(configured).hostname;
      if ((host === "localhost" || host === "127.0.0.1" || host === "::1") && vercel) return vercel;
    } catch {
      return vercel || configured;
    }
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
