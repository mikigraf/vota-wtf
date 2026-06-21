"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function CheckoutReturnStatus({
  purchaseId,
  initialMessage
}: {
  purchaseId: string;
  initialMessage: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(initialMessage);
  const [settled, setSettled] = useState(/\+100 MBucks added|failed|canceled|another profile|No checkout for this profile|Join this event/i.test(initialMessage));
  const lowerMessage = message.toLowerCase();
  const toneClass =
    lowerMessage.includes("completed") || lowerMessage.includes("+100 mbucks")
      ? "text-mint"
      : lowerMessage.includes("failed") || lowerMessage.includes("canceled") || lowerMessage.includes("another profile") || lowerMessage.includes("no checkout")
        ? "text-danger"
        : "text-muted";

  useEffect(() => {
    if (!purchaseId || settled) return;
    let cancelled = false;
    let attempts = 0;

    async function checkStatus() {
      attempts += 1;
      try {
        const response = await fetch(`/api/payments/mollie/status?purchaseId=${encodeURIComponent(purchaseId)}`, {
          cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check test checkout status.");
        if (cancelled) return;
        if (data.purchase?.status === "credited") {
          setMessage("Test checkout completed. +100 MBucks added.");
          setSettled(true);
          router.refresh();
        } else if (data.status === "failed" || data.status === "canceled") {
          setMessage(`Test checkout ${data.status}. No MegaBucks were issued.`);
          setSettled(true);
        } else {
          setMessage("Test checkout is still pending. Checking verified status...");
        }
      } catch {
        if (!cancelled) setMessage("Test checkout return received. Waiting for verified status confirmation.");
      }
    }

    checkStatus();
    const timer = window.setInterval(() => {
      if (attempts >= 12) {
        window.clearInterval(timer);
        if (!cancelled) setMessage("Test checkout is still pending. Refresh this page or start checkout again from the supporter card.");
        return;
      }
      checkStatus();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [purchaseId, router, settled]);

  return <p className={`mt-2 text-sm font-black ${toneClass}`}>{message}</p>;
}
