"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

export function CheckoutButton({
  disabled = false,
  disabledReason,
  returnTo
}: {
  disabled?: boolean;
  disabledReason?: string;
  returnTo?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pathname = usePathname();

  async function checkout() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/payments/mollie/create-test-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: returnTo || pathname || "/" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checkout failed.");
      window.location.href = data.checkoutUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        data-testid="checkout-button"
        type="button"
        onClick={checkout}
        disabled={busy || disabled}
        className="focus-ring min-h-11 rounded-full bg-ember px-5 text-sm font-extrabold text-ink transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Opening checkout..." : disabled ? "Checkout paused" : "Add 100 MBucks"}
      </button>
      {disabled && disabledReason ? <p className="text-sm font-semibold text-muted">{disabledReason}</p> : null}
      {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}
    </div>
  );
}
