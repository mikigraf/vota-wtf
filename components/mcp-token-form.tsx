"use client";

import { useState } from "react";

export function McpTokenForm({
  participants
}: {
  participants: Array<{ id: string; nickname: string; participantType: string }>;
}) {
  const [participantId, setParticipantId] = useState(participants[0]?.id || "");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setToken("");
    try {
      const response = await fetch("/api/admin/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ participantId, expiresInHours: Number(expiresInHours) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create MCP token.");
      setToken(data.token || "");
      setExpiresAt(data.expiresAt || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create MCP token.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <label className="grid gap-2 text-sm font-extrabold">
        Token scope
        <select
          className="focus-ring min-h-11 rounded-xl border-[1.5px] border-line bg-white px-3.5 text-sm font-semibold"
          value={participantId}
          onChange={(event: any) => setParticipantId(event.target.value)}
        >
          <option value="">Choose participant</option>
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.nickname} ({participant.participantType})
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-extrabold">
        Expires in hours
        <input
          className="focus-ring min-h-11 rounded-xl border-[1.5px] border-line px-3.5 text-sm font-semibold"
          min="1"
          max="720"
          type="number"
          value={expiresInHours}
          onChange={(event: any) => setExpiresInHours(event.target.value)}
        />
      </label>
      <button className="focus-ring min-h-11 rounded-full bg-ink px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={busy || !participantId}>
        {busy ? "Creating..." : "Create participant token"}
      </button>
      {token ? (
        <div className="rounded-xl bg-paper p-3">
          <div className="font-mono-vota text-[10px] font-bold uppercase text-ember">Copy once</div>
          <code className="font-mono-vota mt-2 block break-all text-sm font-bold">{token}</code>
          <p className="mt-2 text-xs font-semibold text-muted">Expires {expiresAt || "later"}.</p>
        </div>
      ) : null}
      {error ? <p className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{error}</p> : null}
    </form>
  );
}
