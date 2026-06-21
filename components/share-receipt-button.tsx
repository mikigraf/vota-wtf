"use client";

import { useState } from "react";

export function ShareReceiptButton({ text }: { text: string }) {
  const [message, setMessage] = useState("");

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "vota.wtf receipt", text, url });
        setMessage("Shared.");
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setMessage("Copied link.");
    } catch {
      setMessage("Copy this page URL to share.");
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={share}
        className="focus-ring min-h-12 rounded-full bg-ink px-5 text-sm font-black text-white"
      >
        Share receipt
      </button>
      {message ? <p className="text-xs font-black text-muted">{message}</p> : null}
    </div>
  );
}
