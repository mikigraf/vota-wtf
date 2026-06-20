import { NextRequest } from "next/server";
import { createMcpWriteTokenData } from "@/lib/data";
import { badRequest, clientIpFromRequest, json, readJsonObject, requireAdminRequest } from "@/lib/http";

async function readBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return readJsonObject(request);
  return Object.fromEntries((await request.formData()).entries());
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await readBody(request);
    const participantId = String(body.participantId || "").trim() || undefined;
    const expiresInHours = Number(body.expiresInHours || 72);
    const result = await createMcpWriteTokenData({
      participantId,
      expiresInHours: Number.isFinite(expiresInHours) ? expiresInHours : 72,
      auditIp: clientIpFromRequest(request)
    });
    if ((request.headers.get("accept") || "").includes("application/json")) {
      return json(result);
    }
    const redirectTo = new URL("/admin/agents", request.url);
    redirectTo.searchParams.set("mcpTokenCreated", "1");
    return Response.redirect(redirectTo, 303);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not create MCP token.");
  }
}
