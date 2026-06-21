import { NextRequest } from "next/server";
import { getMcpSessionParticipantData, placePredictionData, readDataStore, verifyMcpWriteTokenData } from "@/lib/data";
import { badRequest, json } from "@/lib/http";
import { calculateAllowedStake, publicMarketState } from "@/lib/store";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([MCP_PROTOCOL_VERSION, "2025-03-26"]);

type JsonRpcId = string | number | null;
type JsonRecord = Record<string, unknown>;

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
    description: "Returns open vota.wtf prediction markets with public outcomes and current room signal. When authenticated, results are scoped to the participant's event.",
    inputSchema: {
      type: "object",
      properties: {},
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
        marketId: { type: "string", description: "The prediction market id." }
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
      properties: {},
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
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.APP_URL,
    process.env.WEBHOOK_BASE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined
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
  return emptyResponse(request, { status: 405, headers: { Allow: "POST, OPTIONS" } });
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
  const store = await readDataStore();
  const session = await getMcpSessionParticipantData(request);
  const visibleOpenMarkets = store.markets.filter((market) => {
    return market.status === "open" && (!session || market.eventId === session.participant.eventId);
  });
  if (tool === "list_markets") {
    return { markets: visibleOpenMarkets.map((market) => publicMarketState(store, market)) };
  }
  if (tool === "get_market") {
    const market = visibleOpenMarkets.find((item) => item.id === body.marketId);
    if (!market) throw new ToolCallError("Market not found.", 404);
    return { market: publicMarketState(store, market) };
  }

  if (tool === "get_wallet") {
    if (!session) throw new ToolCallError("Session or participant-scoped MCP token required.", 401);
    return { wallet: session.wallet };
  }
  if (tool === "calculate_allowed_stake") {
    if (!session) throw new ToolCallError("Session or participant-scoped MCP token required.", 401);
    return {
      allowed: calculateAllowedStake(store, {
        participantId: session.participant.id,
        marketId: stringArg(body, "marketId"),
        outcomeId: stringArg(body, "outcomeId")
      })
    };
  }
  if (tool === "place_prediction") {
    if (!session) throw new ToolCallError("Session or participant-scoped MCP token required.", 401);
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
    return { message: "Use the MEGATHON test checkout in the app for +100 MBucks. No real charge; MegaBucks stay inside vota.wtf." };
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

async function handleJsonRpc(request: NextRequest, body: JsonRecord) {
  const hasId = Object.prototype.hasOwnProperty.call(body, "id");
  const id = validJsonRpcId(body.id) ? body.id : null;
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string" || (hasId && !validJsonRpcId(body.id))) {
    return responseJson(request, rpcError(id, -32600, "Invalid Request"), { status: 400 });
  }

  if (!hasId) return emptyResponse(request, { status: 202 });

  if (body.method === "initialize") {
    const params = isRecord(body.params) ? body.params : {};
    const requestedVersion = typeof params.protocolVersion === "string" ? params.protocolVersion : MCP_PROTOCOL_VERSION;
    return responseJson(request, rpcResult(id, {
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
    }));
  }

  if (body.method === "ping") {
    return responseJson(request, rpcResult(id, {}));
  }

  if (body.method === "tools/list") {
    return responseJson(request, rpcResult(id, { tools: toolDefinitions }));
  }

  if (body.method === "tools/call") {
    const params = isRecord(body.params) ? body.params : {};
    const name = typeof params.name === "string" ? params.name : "";
    const args = isRecord(params.arguments) ? params.arguments : {};
    if (!supportedTool(name)) {
      return responseJson(request, rpcError(id, -32602, `Unknown tool: ${name || "missing tool name"}`), { status: 400 });
    }
    try {
      return responseJson(request, rpcResult(id, toolResult(await runTool(request, name, args))));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool call failed.";
      return responseJson(request, rpcResult(id, toolError(message)));
    }
  }

  return responseJson(request, rpcError(id, -32601, `Method not found: ${body.method}`), { status: 404 });
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
  return methodNotAllowed(request);
}

export async function DELETE(request: NextRequest) {
  if (!isAllowedOrigin(request)) return responseJson(request, { error: "Forbidden origin." }, { status: 403 });
  return methodNotAllowed(request);
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) return responseJson(request, { error: "Forbidden origin." }, { status: 403 });
  const badProtocol = protocolVersionResponse(request);
  if (badProtocol) return badProtocol;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseJson(request, rpcError(null, -32700, "Parse error"), { status: 400 });
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
