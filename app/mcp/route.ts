import { NextRequest } from "next/server";
import {
  findEventByIdData,
  findEventBySlugData,
  getMcpSessionParticipantData,
  placePredictionData,
  readPublicEventStoreData,
  readPublicMarketStoreData,
  verifyMcpWriteTokenData
} from "@/lib/data";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { badRequest, json } from "@/lib/http";
import { hasCompletedProfile } from "@/lib/participants";
import { calculateAllowedStake, publicMarketState } from "@/lib/store";
import { CANONICAL_PUBLIC_BASE_URL } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([MCP_PROTOCOL_VERSION, "2025-03-26"]);

type JsonRpcId = string | number | null;
type JsonRecord = Record<string, unknown>;
type RpcDispatch =
  | { kind: "empty"; status?: number; headers?: HeadersInit }
  | { kind: "json"; body: unknown; status?: number; headers?: HeadersInit };

class ToolCallError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const toolDefinitions = [
  {
    name: "list_markets",
    title: "List open prediction markets",
    description: "Returns open vota.wtf prediction markets with public outcomes and current room signal. When authenticated, results are scoped to the participant's event. Without authentication, pass eventSlug or use the configured default event.",
    inputSchema: {
      type: "object",
      properties: {
        eventSlug: { type: "string", description: "Optional event slug for unauthenticated read-only market discovery." }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_market",
    title: "Get one open prediction market",
    description: "Returns one open market by marketId. Draft, locked, resolved, voided, and cross-event markets are not exposed.",
    inputSchema: {
      type: "object",
      properties: {
        marketId: { type: "string", description: "The prediction market id." },
        eventSlug: { type: "string", description: "Optional event slug for unauthenticated reads." }
      },
      required: ["marketId"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_wallet",
    title: "Get agent wallet",
    description: "Returns the authenticated participant wallet. Requires a participant session cookie or participant-scoped MCP bearer token.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "calculate_allowed_stake",
    title: "Calculate allowed stake",
    description: "Calculates the maximum MegaBucks the authenticated participant may add to an outcome right now.",
    inputSchema: {
      type: "object",
      properties: {
        marketId: { type: "string", description: "The open prediction market id." },
        outcomeId: { type: "string", description: "The outcome id inside the market." }
      },
      required: ["marketId", "outcomeId"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "place_prediction",
    title: "Place prediction",
    description: "Places or updates the authenticated participant prediction. Requires Authorization: Bearer <mcp token> and requestId/idempotencyKey for retry safety.",
    inputSchema: {
      type: "object",
      properties: {
        marketId: { type: "string", description: "The open prediction market id." },
        outcomeId: { type: "string", description: "The outcome id to back." },
        amountCredits: { type: "integer", minimum: 0, description: "MegaBucks to commit. First predictions usually require 100." },
        requestId: { type: "string", description: "Required idempotency key for retry-safe calls." },
        idempotencyKey: { type: "string", description: "Alias for requestId." }
      },
      required: ["marketId", "outcomeId", "amountCredits", "requestId"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: "request_more_budget",
    title: "Request more MegaBucks",
    description: "Explains how the participant can get more test MegaBucks inside the event app.",
    inputSchema: {
      type: "object",
      properties: {
        eventSlug: { type: "string", description: "Optional event slug for unauthenticated budget guidance." }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  }
] as const;

function predictionRequestId(request: NextRequest, body: JsonRecord) {
  const header = request.headers.get("idempotency-key") || request.headers.get("x-idempotency-key") || "";
  const bodyValue = typeof body.requestId === "string"
    ? body.requestId
    : typeof body.idempotencyKey === "string"
      ? body.idempotencyKey
      : "";
  return (header || bodyValue).trim().slice(0, 128) || undefined;
}

function requiredPredictionRequestId(request: NextRequest, body: JsonRecord) {
  const requestId = predictionRequestId(request, body);
  if (!requestId) throw new ToolCallError("Prediction request id required.");
  return requestId;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArg(body: JsonRecord, name: string) {
  const value = body[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolCallError(`${name} is required.`);
  }
  return value.trim();
}

function integerArg(body: JsonRecord, name: string) {
  const value = Number(body[name]);
  if (!Number.isFinite(value) || Math.floor(value) !== value) {
    throw new ToolCallError(`${name} must be an integer.`);
  }
  return value;
}

function allowedOrigins(request: NextRequest) {
  const origins = new Set<string>([request.nextUrl.origin]);
  for (const value of [
    CANONICAL_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.APP_URL,
    process.env.WEBHOOK_BASE_URL
  ]) {
    if (value) origins.add(value.replace(/\/$/, ""));
  }
  for (const value of (process.env.MCP_ALLOWED_ORIGINS || "").split(",")) {
    const trimmed = value.trim().replace(/\/$/, "");
    if (trimmed) origins.add(trimmed);
  }
  return origins;
}

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (allowedOrigins(request).has(origin.replace(/\/$/, ""))) return true;
  if (process.env.NODE_ENV !== "production") {
    try {
      const host = new URL(origin).hostname;
      return host === "localhost" || host === "127.0.0.1";
    } catch {
      return false;
    }
  }
  return false;
}

function corsHeaders(request: NextRequest) {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && isAllowedOrigin(request)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, Idempotency-Key, Mcp-Protocol-Version, Mcp-Session-Id, X-Idempotency-Key");
  headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
  return headers;
}

function responseJson(request: NextRequest, data: unknown, init: ResponseInit = {}) {
  const headers = corsHeaders(request);
  for (const [key, value] of new Headers(init.headers)) headers.set(key, value);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function emptyResponse(request: NextRequest, init: ResponseInit = {}) {
  const headers = corsHeaders(request);
  for (const [key, value] of new Headers(init.headers)) headers.set(key, value);
  return new Response(null, { ...init, headers });
}

function methodNotAllowed(request: NextRequest) {
  return emptyResponse(request, { status: 405, headers: { Allow: "POST, GET, DELETE, OPTIONS" } });
}

function accepts(request: NextRequest, contentType: string) {
  const accept = request.headers.get("accept") || "";
  if (!accept || accept.includes("*/*")) return true;
  return accept
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .some((part) => part === contentType);
}

function mcpAcceptResponse(request: NextRequest, method: "GET" | "POST") {
  if (method === "GET") {
    if (accepts(request, "text/event-stream")) return null;
    return responseJson(request, { error: "MCP Streamable HTTP GET requires Accept: text/event-stream." }, { status: 406 });
  }
  if (accepts(request, "application/json") && accepts(request, "text/event-stream")) return null;
  return responseJson(
    request,
    rpcError(null, -32000, "MCP Streamable HTTP POST requires Accept: application/json, text/event-stream."),
    { status: 406 }
  );
}

function contentTypeResponse(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) return null;
  return responseJson(request, rpcError(null, -32000, "MCP Streamable HTTP POST requires Content-Type: application/json."), {
    status: 415
  });
}

function mcpSessionId(request: NextRequest) {
  const existing = request.headers.get("mcp-session-id")?.trim();
  if (existing) return existing.slice(0, 128);
  const randomValue =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `vota_${randomValue.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function sseResponse(request: NextRequest) {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("Connection", "keep-alive");
  headers.set("X-Accel-Buffering", "no");
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      write(": vota.wtf MCP stream ready\n\n");
      timer = setInterval(() => {
        try {
          write(`: ping ${Date.now()}\n\n`);
        } catch {
          if (timer) clearInterval(timer);
        }
      }, 25000);
      request.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          // The client may have already closed the stream.
        }
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
    }
  });
  return new Response(stream, { status: 200, headers });
}

function dispatchResponse(request: NextRequest, dispatch: RpcDispatch) {
  if (dispatch.kind === "empty") {
    return emptyResponse(request, { status: dispatch.status || 202, headers: dispatch.headers });
  }
  return responseJson(request, dispatch.body, { status: dispatch.status || 200, headers: dispatch.headers });
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function toolResult(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: false
  };
}

function toolError(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

function supportedTool(name: string) {
  return toolDefinitions.some((tool) => tool.name === name);
}

async function runTool(request: NextRequest, tool: string, args: JsonRecord) {
  const body = args;
  const session = await getMcpSessionParticipantData(request);
  const requestedEventSlug = typeof body.eventSlug === "string" ? body.eventSlug.trim() : "";
  const readOnlyEventSlug = requestedEventSlug || process.env.NEXT_PUBLIC_EVENT_SLUG || DEFAULT_EVENT_SLUG;
  const visibleEventForRequest = () => session
    ? findEventByIdData(session.participant.eventId)
    : findEventBySlugData(readOnlyEventSlug);
  if (tool === "list_markets") {
    const visibleEvent = await visibleEventForRequest();
    if (!visibleEvent) return { markets: [] };
    const store = await readPublicEventStoreData(visibleEvent.slug, session?.session.id);
    const visibleOpenMarkets = store.markets.filter((market) => market.status === "open" && market.eventId === visibleEvent.id);
    return { markets: visibleOpenMarkets.map((market) => publicMarketState(store, market)) };
  }
  if (tool === "get_market") {
    const marketId = stringArg(body, "marketId");
    const store = await readPublicMarketStoreData(marketId, session?.session.id);
    const market = store.markets.find((item) => item.id === marketId && item.status === "open");
    const event = market ? store.events.find((item) => item.id === market.eventId) : undefined;
    const allowedEvent = session ? market?.eventId === session.participant.eventId : event?.slug === readOnlyEventSlug;
    if (!market || !allowedEvent) throw new ToolCallError("Market not found.", 404);
    return { market: publicMarketState(store, market) };
  }

  if (tool === "get_wallet") {
    if (!session) throw new ToolCallError("Session or participant-scoped MCP token required.", 401);
    return { wallet: session.wallet };
  }
  if (tool === "calculate_allowed_stake") {
    if (!session) throw new ToolCallError("Session or participant-scoped MCP token required.", 401);
    if (session.participant.participantType === "human" && !hasCompletedProfile(session.participant)) {
      throw new ToolCallError("Finish your profile before predicting.", 401);
    }
    const marketId = stringArg(body, "marketId");
    const outcomeId = stringArg(body, "outcomeId");
    const store = await readPublicMarketStoreData(marketId, session.session.id);
    const market = store.markets.find((item) => item.id === marketId && item.status === "open" && item.eventId === session.participant.eventId);
    if (!market) throw new ToolCallError("Market not found.", 404);
    return {
      allowed: calculateAllowedStake(store, {
        participantId: session.participant.id,
        marketId,
        outcomeId
      })
    };
  }
  if (tool === "place_prediction") {
    if (!session) throw new ToolCallError("Session or participant-scoped MCP token required.", 401);
    if (session.participant.participantType === "human" && !hasCompletedProfile(session.participant)) {
      throw new ToolCallError("Finish your profile before predicting.", 401);
    }
    if (!(await verifyMcpWriteTokenData(request, session.participant.id))) {
      throw new ToolCallError("MCP write token required.", 401);
    }
    const result = await placePredictionData(session.session.id, {
      participantId: session.participant.id,
      marketId: stringArg(body, "marketId"),
      outcomeId: stringArg(body, "outcomeId"),
      amountCredits: integerArg(body, "amountCredits"),
      requestId: requiredPredictionRequestId(request, body)
    });
    return { result };
  }
  if (tool === "request_more_budget") {
    const visibleEvent = await visibleEventForRequest();
    return {
      message: `Use the ${visibleEvent?.name || "event"} test checkout in the app for +100 MBucks. No real charge; MegaBucks stay inside vota.wtf.`
    };
  }
  throw new ToolCallError("Unsupported MCP tool.", 404);
}

async function legacyToolResponse(request: NextRequest, body: JsonRecord) {
  const tool = String(body.tool || "");
  try {
    return json(await runTool(request, tool, body));
  } catch (error) {
    if (error instanceof ToolCallError) return badRequest(error.message, error.status);
    return badRequest(error instanceof Error ? error.message : "MCP tool failed.");
  }
}

function validJsonRpcId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

async function dispatchJsonRpc(request: NextRequest, body: JsonRecord): Promise<RpcDispatch> {
  const hasId = Object.prototype.hasOwnProperty.call(body, "id");
  const id = validJsonRpcId(body.id) ? body.id : null;
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string" || (hasId && !validJsonRpcId(body.id))) {
    return { kind: "json", body: rpcError(id, -32600, "Invalid Request"), status: 400 };
  }

  if (!hasId) return { kind: "empty", status: 202 };

  if (body.method === "initialize") {
    const params = isRecord(body.params) ? body.params : {};
    const requestedVersion = typeof params.protocolVersion === "string" ? params.protocolVersion : MCP_PROTOCOL_VERSION;
    return {
      kind: "json",
      headers: { "Mcp-Session-Id": mcpSessionId(request) },
      body: rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion) ? requestedVersion : MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false }
        },
        serverInfo: {
          name: "vota-wtf",
          title: "vota.wtf Prediction Markets",
          version: "7.0.0"
        },
        instructions: "Use list_markets and calculate_allowed_stake before place_prediction. place_prediction requires a participant-scoped MCP bearer token and a stable requestId/idempotencyKey for retry safety."
      })
    };
  }

  if (body.method === "ping") {
    return { kind: "json", body: rpcResult(id, {}) };
  }

  if (body.method === "tools/list") {
    return { kind: "json", body: rpcResult(id, { tools: toolDefinitions }) };
  }

  if (body.method === "tools/call") {
    const params = isRecord(body.params) ? body.params : {};
    const name = typeof params.name === "string" ? params.name : "";
    const args = isRecord(params.arguments) ? params.arguments : {};
    if (!supportedTool(name)) {
      return { kind: "json", body: rpcError(id, -32602, `Unknown tool: ${name || "missing tool name"}`), status: 400 };
    }
    try {
      return { kind: "json", body: rpcResult(id, toolResult(await runTool(request, name, args))) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool call failed.";
      return { kind: "json", body: rpcResult(id, toolError(message)) };
    }
  }

  return { kind: "json", body: rpcError(id, -32601, `Method not found: ${body.method}`), status: 404 };
}

async function handleJsonRpc(request: NextRequest, body: JsonRecord) {
  return dispatchResponse(request, await dispatchJsonRpc(request, body));
}

async function handleJsonRpcBatch(request: NextRequest, batch: unknown[]) {
  if (batch.length === 0) {
    return responseJson(request, rpcError(null, -32600, "Invalid Request"), { status: 400 });
  }
  const responses: unknown[] = [];
  let status = 200;
  const headers = new Headers();
  for (const item of batch) {
    if (!isRecord(item)) {
      responses.push(rpcError(null, -32600, "Invalid Request"));
      status = Math.max(status, 400);
      continue;
    }
    const dispatch = await dispatchJsonRpc(request, item);
    if (dispatch.headers) {
      for (const [key, value] of new Headers(dispatch.headers)) headers.set(key, value);
    }
    if (dispatch.kind === "json") {
      responses.push(dispatch.body);
      status = Math.max(status, dispatch.status || 200);
    }
  }
  if (responses.length === 0) return emptyResponse(request, { status: 202, headers });
  return responseJson(request, responses, { status, headers });
}

function protocolVersionResponse(request: NextRequest) {
  const version = request.headers.get("mcp-protocol-version");
  if (!version || SUPPORTED_PROTOCOL_VERSIONS.has(version)) return null;
  return responseJson(request, rpcError(null, -32600, `Unsupported MCP protocol version: ${version}`), { status: 400 });
}

export async function OPTIONS(request: NextRequest) {
  if (!isAllowedOrigin(request)) return responseJson(request, { error: "Forbidden origin." }, { status: 403 });
  return emptyResponse(request, { status: 204 });
}

export async function GET(request: NextRequest) {
  if (!isAllowedOrigin(request)) return responseJson(request, { error: "Forbidden origin." }, { status: 403 });
  const badProtocol = protocolVersionResponse(request);
  if (badProtocol) return badProtocol;
  const badAccept = mcpAcceptResponse(request, "GET");
  if (badAccept) return badAccept;
  return sseResponse(request);
}

export async function DELETE(request: NextRequest) {
  if (!isAllowedOrigin(request)) return responseJson(request, { error: "Forbidden origin." }, { status: 403 });
  const badProtocol = protocolVersionResponse(request);
  if (badProtocol) return badProtocol;
  return emptyResponse(request, { status: 202 });
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) return responseJson(request, { error: "Forbidden origin." }, { status: 403 });
  const badProtocol = protocolVersionResponse(request);
  if (badProtocol) return badProtocol;
  const badAccept = mcpAcceptResponse(request, "POST");
  if (badAccept) return badAccept;
  const badContentType = contentTypeResponse(request);
  if (badContentType) return badContentType;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseJson(request, rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  if (Array.isArray(body)) {
    return handleJsonRpcBatch(request, body);
  }
  if (!isRecord(body)) {
    return responseJson(request, rpcError(null, -32600, "Invalid Request"), { status: 400 });
  }
  const legacyToolName = body.tool;
  if (typeof legacyToolName === "string" && body.jsonrpc !== "2.0") {
    return legacyToolResponse(request, body);
  }
  return handleJsonRpc(request, body);
}
