export const DEFAULT_EVENT_SLUG = process.env.NEXT_PUBLIC_EVENT_SLUG || "megathon";
export const LEGACY_EVENT_SLUG = "megathon-2026";
export const LIVESTREAM_DEMO_EVENT_SLUG = "livestream-demo";
export const STARTER_CREDITS = 1000;
export const TEST_CHECKOUT_CREDITS = 100;
export const TEST_CHECKOUT_EUR = 1;
export const INITIAL_STAKE_AMOUNT = 100;
export const PLATFORM_PROVISION_RATE = 0.02;
export const PLATFORM_PRIOR_CREDITS_PER_OUTCOME = 100;
export const MAX_ACTION_STAKE = 250;
export const COOLDOWN_SECONDS = 30;
export const MAX_HUMAN_MARKET_SHARE = 0.15;
export const MAX_AGENT_MARKET_SHARE = 0.05;
export const MAX_PRICE_IMPACT = 0.05;
export const FAIR_LAUNCH_PEOPLE = 25;
export const FAIR_LAUNCH_SIGNAL_CREDITS = 5000;
export const BLIND_LAUNCH_PREDICTIONS = 20;
export const BLIND_LAUNCH_SECONDS = 120;

export const SAFE_COPY = {
  noPayout: "No real-money payouts. Correct calls settle internal MegaBucks and earn reputation.",
  checkout: "Add 100 MBucks in event test mode. No real charge. MegaBucks stay inside vota.wtf.",
  whaleGuard: "This market cannot absorb that much yet."
};
