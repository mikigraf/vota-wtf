const LOCAL_ORIGIN = "https://vota.local";
const MAX_RETURN_PATH_LENGTH = 240;

function safeLocalPath(
  value: unknown,
  fallback: string,
  allowed: (path: string) => boolean,
  stripParams: string[] = []
) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_RETURN_PATH_LENGTH ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /%5c/i.test(trimmed) ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return fallback;
  }

  try {
    const url = new URL(trimmed, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return fallback;
    if (!allowed(url.pathname)) return fallback;
    for (const param of stripParams) url.searchParams.delete(param);
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function safeParticipantNextPath(value?: unknown) {
  return safeLocalPath(value, "", (pathname) => !isAdminPath(pathname) && !isApiPath(pathname));
}

export function safeAdminNextPath(value?: unknown, fallback = "/admin") {
  return safeLocalPath(value, fallback, (pathname) => isAdminPath(pathname) && pathname !== "/admin/login");
}

export function safeAdminReturnPath(value?: unknown, fallback = "/admin/stage") {
  return safeAdminNextPath(value, fallback);
}

export function safeCheckoutReturnPath(value: unknown, eventSlug: string) {
  return safeLocalPath(value, `/e/${eventSlug}`, (pathname) => !isAdminPath(pathname) && !isApiPath(pathname), ["checkout"]);
}
