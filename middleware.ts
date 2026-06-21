import { NextResponse, type NextRequest } from "next/server";
import { isAdminFromRequest } from "@/lib/auth";

function sameOriginAdminMutation(request: NextRequest) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (origin) return origin === request.nextUrl.origin;
  if (referer) {
    try {
      return new URL(referer).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/admin/login") {
    return NextResponse.next();
  }
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const ok = await isAdminFromRequest(request);
    if (!ok) {
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
  }
  if (pathname.startsWith("/api/admin")) {
    const ok = await isAdminFromRequest(request);
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!sameOriginAdminMutation(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
