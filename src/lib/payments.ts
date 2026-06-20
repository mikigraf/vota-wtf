import { attachPaymentToPurchaseData, creditPaidPurchaseData, findPurchaseData } from "./data";
import type { Purchase } from "./types";
type VerifiedPaymentStatus = "paid" | "failed" | "canceled" | "pending";

function expectedAmount(value: number) {
  return value.toFixed(2);
}

function assertMolliePaymentMatchesPurchase(data: Record<string, any>, purchase: Purchase) {
  if (data.id && data.id !== purchase.molliePaymentId) throw new Error("Mollie payment id mismatch.");
  if (data.amount?.currency !== purchase.currency) throw new Error("Mollie payment currency mismatch.");
  if (String(data.amount?.value || "") !== expectedAmount(purchase.amountEur)) throw new Error("Mollie payment amount mismatch.");
  if (data.metadata?.purchaseId !== purchase.id) throw new Error("Mollie payment metadata mismatch.");
  if (data.metadata?.testOnly !== true) throw new Error("Mollie payment is not marked as test-only.");
}

async function fetchMolliePayment(paymentId: string) {
  const key = process.env.MOLLIE_API_KEY || "";
  if (!key.startsWith("test_")) throw new Error("Mollie must stay in test mode.");
  const response = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Could not verify Mollie status.");
  return response.json();
}

function assertMolliePaymentMatchesKnownPurchase(data: Record<string, any>, purchase: Purchase) {
  if (!purchase.molliePaymentId) {
    if (data.amount?.currency !== purchase.currency) throw new Error("Mollie payment currency mismatch.");
    if (String(data.amount?.value || "") !== expectedAmount(purchase.amountEur)) throw new Error("Mollie payment amount mismatch.");
    if (data.metadata?.purchaseId !== purchase.id) throw new Error("Mollie payment metadata mismatch.");
    if (data.metadata?.testOnly !== true) throw new Error("Mollie payment is not marked as test-only.");
    return;
  }
  assertMolliePaymentMatchesPurchase(data, purchase);
}

export async function molliePaymentStatus(purchase: Purchase) {
  const paymentId = purchase.molliePaymentId || purchase.id;
  if (paymentId.startsWith("local_") && process.env.NODE_ENV !== "production") return "paid";
  const data = await fetchMolliePayment(paymentId);
  assertMolliePaymentMatchesKnownPurchase(data, purchase);
  return String(data.status || "pending");
}

function normalizePaymentStatus(status: string): VerifiedPaymentStatus {
  if (status === "paid") return "paid";
  if (status === "failed" || status === "expired") return "failed";
  if (status === "canceled" || status === "cancelled") return "canceled";
  return "pending";
}

export async function verifyAndCreditPurchase(input: string | Purchase, auditIp?: string) {
  let purchase = typeof input === "string" ? await findPurchaseData(input) : input;
  if (!purchase && typeof input === "string" && input.startsWith("tr_")) {
    const data = await fetchMolliePayment(input);
    const purchaseId = String(data.metadata?.purchaseId || "");
    if (!purchaseId) throw new Error("Mollie payment metadata mismatch.");
    const missingAttachPurchase = await findPurchaseData(purchaseId);
    if (!missingAttachPurchase) throw new Error("Purchase not found.");
    assertMolliePaymentMatchesKnownPurchase(data, missingAttachPurchase);
    purchase = await attachPaymentToPurchaseData(missingAttachPurchase.id, {
      molliePaymentId: String(data.id || input),
      checkoutUrl: String(data._links?.checkout?.href || missingAttachPurchase.checkoutUrl || "")
    });
  }
  if (!purchase) throw new Error("Purchase not found.");
  const status = normalizePaymentStatus(await molliePaymentStatus(purchase));
  if (status === "pending") return { purchase, credited: false, status };
  const result = await creditPaidPurchaseData(purchase.id, status, auditIp);
  return { ...result, status: result.purchase.status };
}
