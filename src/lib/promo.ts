import { participantReceipt } from "./store";
import type { Store } from "./types";
import { credits, pct } from "./utils";

export interface ReceiptPromoFrame {
  kicker: string;
  headline: string;
  detail: string;
}

export interface ReceiptPromo {
  status: "ready" | "pending";
  title: string;
  subtitle: string;
  frames: ReceiptPromoFrame[];
  shareCopy: string;
  pixVersePrompt: string;
}

export function buildReceiptPromo(store: Store, receiptId: string): ReceiptPromo {
  const receipt = participantReceipt(store, receiptId, receiptId);
  if (!receipt?.market || !receipt.outcome) {
    return {
      status: "pending",
      title: "Receipt pending",
      subtitle: "Resolve a correct prediction before this cut can publish.",
      frames: [
        {
          kicker: "vota.wtf",
          headline: "The take is locked.",
          detail: "Waiting for the judges to reveal the outcome."
        },
        {
          kicker: "Reputation only",
          headline: "Just credibility.",
          detail: "Oracle Score appears after resolution."
        }
      ],
      shareCopy: "I locked my MEGATHON take on vota.wtf.",
      pixVersePrompt:
        "Create a short event teaser for vota.wtf: QR scan, prediction card, stage signal bars, then a pending receipt waiting for the reveal."
    };
  }

  const participant = receipt.participant.nickname;
  const title = `${participant} called it`;
  const rarity = pct(receipt.peopleAtCall);
  const score = credits(receipt.oracleScore);
  return {
    status: "ready",
    title,
    subtitle: `${receipt.outcome.label} on ${receipt.market.title}`,
    frames: [
      {
        kicker: "The call",
        headline: receipt.outcome.label,
        detail: `${participant} backed it before the room moved.`
      },
      {
        kicker: "At lock time",
        headline: `${rarity} people signal`,
        detail: "The take landed before consensus became obvious."
      },
      {
        kicker: "Oracle Score",
        headline: `+${score}`,
        detail: "Reputation only."
      }
    ],
    shareCopy: `${participant} called ${receipt.outcome.label} early on vota.wtf and earned +${score} Oracle Score. You saw it first.`,
    pixVersePrompt:
      `Create a 9:16 animated receipt for vota.wtf. Start with a MEGATHON stage signal, show ${participant}'s prediction for ` +
      `${receipt.outcome.label}, reveal that only ${rarity} backed it at lock time, then end on +${score} Oracle Score. ` +
      "Use crisp UI overlays, energetic stage lighting, and reputation-only language."
  };
}
