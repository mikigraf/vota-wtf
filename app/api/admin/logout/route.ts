import { NextRequest, NextResponse } from "next/server";
import { adminApiCookieName, adminCookieName } from "@/lib/auth";
import { requireAdminRequest } from "@/lib/http";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const response = NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 });
  response.cookies.set(adminCookieName(), "", { path: "/admin", maxAge: 0 });
  response.cookies.set(adminApiCookieName(), "", { path: "/api/admin", maxAge: 0 });
  return response;
}
