const DEFAULT_REALTIME_TABLES = [
  "events",
  "markets",
  "outcomes"
];

export function realtimeTableNames() {
  return [...DEFAULT_REALTIME_TABLES];
}

interface RealtimeMessage {
  event?: string;
  payload?: unknown;
}

export function buildRealtimeSocketUrl(
  projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
) {
  if (!projectUrl || !anonKey) return undefined;
  const url = new URL(projectUrl);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.pathname = "/realtime/v1/websocket";
  url.search = "";
  url.searchParams.set("apikey", anonKey);
  url.searchParams.set("vsn", "1.0.0");
  return url.toString();
}

export function isRealtimeInvalidationMessage(value: unknown) {
  const message = typeof value === "string" ? safeParseRealtimeMessage(value) : value;
  if (!message || typeof message !== "object") return false;
  const event = (message as RealtimeMessage).event;
  return event === "postgres_changes" || event === "broadcast";
}

export function subscribeToSupabaseRealtime(
  onChange: () => void,
  options: { tables?: string[]; debounceMs?: number } = {}
) {
  const socketUrl = buildRealtimeSocketUrl();
  if (!socketUrl || typeof window === "undefined" || typeof window.WebSocket === "undefined") {
    return () => {};
  }

  const tables = options.tables || DEFAULT_REALTIME_TABLES;
  const debounceMs = options.debounceMs ?? 150;
  const topic = `realtime:vota_wtf_${Math.random().toString(36).slice(2)}`;
  const joinRef = String(Date.now());
  let ref = 1;
  let stopped = false;
  let socket: WebSocket | undefined;
  let heartbeatTimer: number | undefined;
  let reconnectTimer: number | undefined;
  let debounceTimer: number | undefined;

  const nextRef = () => String(ref++);
  const send = (event: string, payload: unknown, targetTopic = topic) => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ topic: targetTopic, event, payload, ref: nextRef(), join_ref: joinRef }));
  };
  const scheduleChange = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(onChange, debounceMs);
  };
  const clearSocketTimers = () => {
    window.clearInterval(heartbeatTimer);
    window.clearTimeout(reconnectTimer);
  };
  const connect = () => {
    socket = new WebSocket(socketUrl);
    socket.addEventListener("open", () => {
      send("phx_join", {
        access_token: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        config: {
          broadcast: { self: false },
          presence: { key: "" },
          postgres_changes: tables.map((table) => ({ event: "*", schema: "public", table }))
        }
      });
      heartbeatTimer = window.setInterval(() => send("heartbeat", {}, "phoenix"), 25_000);
    });
    socket.addEventListener("message", (event) => {
      if (isRealtimeInvalidationMessage(event.data)) scheduleChange();
    });
    socket.addEventListener("close", () => {
      clearSocketTimers();
      if (!stopped) reconnectTimer = window.setTimeout(connect, 5_000);
    });
    socket.addEventListener("error", () => {
      socket?.close();
    });
  };

  connect();

  return () => {
    stopped = true;
    clearSocketTimers();
    window.clearTimeout(debounceTimer);
    send("phx_leave", {});
    socket?.close();
  };
}

function safeParseRealtimeMessage(value: string) {
  try {
    return JSON.parse(value) as RealtimeMessage;
  } catch {
    return undefined;
  }
}
