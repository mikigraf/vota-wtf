# Live Event Readiness Plan

This plan is the stage-day gate for `vota.wtf`. Automated checks prove the server-side invariants, but the deployed app still needs a real browser and phone smoke test before the room opens.

## Current Evidence

- `npm test`, `npm run lint`, `npm run build`, and local `npm run readiness` are the required code gates.
- `npm run load:500` is the local engine load gate for 500 participant/profile/prediction flows, idempotency replays, and winner-pool settlement math.
- `npm run e2e:local` is the local Supabase browser gate. It resets local Supabase, seeds `Megathon` and `megatalkTesting`, starts Next on `127.0.0.1:3100`, and runs desktop plus Pixel 7 Playwright flows.
- `npm run verify:deploy` is the required deployed gate. It fails unless `READINESS_URL` points at the deployed origin or `/api/readiness`.
- Supabase production must have every migration through `supabase/migrations/036_admin_event_switcher_seed_events.sql` applied.
- This sandbox cannot bind `127.0.0.1:3000`, so local browser and mobile screenshots are not sufficient evidence here.

## Critical Findings

| Issue | What was broken | Why it matters | Required fix / validation |
| --- | --- | --- | --- |
| Market resolution reliability | Supabase resolution previously hit unsafe SQL paths and could conflict with wallet/participant locks. | Admin resolve is the highest-pressure stage action; it cannot fail live. | Apply migrations through `034`, then lock and resolve a throwaway deployed market from `/admin/markets`. Confirm the market moves to resolution mode, winning users receive proportional winner-pool settlement ledger entries, and `/admin/readiness` stays green. |
| Mobile participant recovery | Mobile browser/IP changes could create duplicate sessions or lose wallet state. | People scanning QR codes on event Wi-Fi must not restart or lose their MegaBucks. | Confirm a phone can join, close the tab, switch network/Wi-Fi, reopen `/j/megathon-2026`, and keep the same profile/wallet. |
| Blocked prediction switches | A zero-MegaBuck switch could preview impossible movement when Whale Guard blocked the action. | Users see the market as unfair if the UI suggests movement they cannot commit. | In a seeded market, try an oversized/switch prediction and confirm the UI shows the cap and the confirm button stays disabled. |
| Voided/stale market pages | A participant could keep a direct market URL open after the admin voided it. | Stage operators need void to immediately remove broken cards from participant flow. | Open a market on mobile, void it from admin, then confirm the phone redirects to the event page and cannot submit a prediction. |
| Human signal contamination | Agent positions could leak into the default room signal, odds timeline, or slippage preview. | The stage promise is human room signal first, agents separated. | Run stage mode with agent activity and confirm default room/odds/preview display is human-only while agent views stay separate. |
| Checkout return continuity | Checkout from a market could return users to event home or poll a checkout owned by a different profile. | Mobile users topping up during a live prediction should land back where they started and see a clear recovery state if cookies change. | From `/m/<market>`, start checkout, return, and confirm the market page verifies status and the wallet refreshes. In another browser, open the same checkout return URL and confirm it gives recovery copy instead of polling forever. |
| Stage QR host correctness | Long preview deploy URLs previously fell back to a hard-coded `vota.wtf` host. | A QR code pointed at the wrong deployment breaks the entire room. | If `NEXT_PUBLIC_BASE_URL` is long, set `NEXT_PUBLIC_QR_BASE_URL` to the real compact production host and confirm `/admin/readiness` passes `stage-qr-base`. |

## Major Findings

| Issue | What was broken | Why it matters | Required fix / validation |
| --- | --- | --- | --- |
| Profile edit avatar handling | Editing a profile with an existing generated/uploaded avatar could resend the old URL as an upload. | Profile edit should feel harmless during live onboarding. | On mobile and desktop, update name/role without choosing a new photo; confirm the avatar remains stable and no error appears. |
| Stage featured market fallback | Hiding/voiding the featured market could leave stage mode pointing at an unavailable card. | The projector must never show a dead market. | Hide and void the featured market from admin; confirm stage falls back to a valid market or join mode. |
| Resolution reveal fallback | Resolution mode could fail if the currently featured market was unresolved or if a non-resolved market was featured while resolution mode was active. | Operators should be able to hit resolution reveal under pressure without hand-selecting the exact market first. | Apply migrations through `034`, resolve one market while another unresolved market is featured, then switch to resolution mode and feature an open market. Confirm resolution either uses a resolved market or automatically returns to live mode. |
| Stage control response shape | Supabase and local stage-control responses diverged. | Admin UI refreshes must behave the same in production as local tests. | Use `/admin/stage` to switch between join, live, role battle, humans vs agents, leaderboard, and resolution. |
| Stage live/resolution mode mix-up | Resolved markets could be selected for live, role battle, or humans-vs-agents modes. | The projector can make a finished card look live again, confusing the MC and room. | Apply migrations through `034`; live/role modes must reject or fall back to open/locked stage markets, while resolution mode continues to use resolved markets only. |
| Production auto-seeding | Supabase auto-seeding could insert demo/live seed data on first production read. | Demo markets and participants must not appear in the live event by accident. | Keep `VOTA_ENABLE_PRODUCTION_AUTO_SEED` unset in production unless intentionally reseeding a disposable environment. Confirm root `/` redirects to `/join/${NEXT_PUBLIC_EVENT_SLUG}`. |
| Payment orphan recovery | If Mollie payment creation succeeds but DB attach fails, webhook lookup by Mollie id could miss the purchase. | A paid test checkout could need manual reconciliation. | Webhook/status verification now recovers by reading Mollie metadata `purchaseId` when lookup by Mollie id fails. Still verify one deployed checkout end-to-end before doors open. |
| Runtime DB contract readiness | Static migration tests do not prove the deployed Supabase project has every required RPC signature. | Admin actions can fail if the app deploy is ahead of database migrations. | `/admin/readiness` now calls `readiness_contract_tx()` and fails if checkout intents, profile lock, idempotency, ledger settlement columns, or pool settlement RPCs are missing. |
| Mobile first-screen density | The participant event and market pages can regress into desktop-style landing content that pushes the prediction action below the fold. | Live users should understand the next action immediately after scanning a QR code. | On a real phone, confirm `/join/<event>`, `/e/<event>`, and `/m/<market>` show the required action without hunting: name/role/enter, live market CTA, outcome choices, amount, and submit. Optional avatar, checkout, history, and leaderboards may sit behind disclosures or below the fold. |
| MCP token scope | Admin can still create broad MCP tokens that are easy to misuse during a live demo. | Agents should not accidentally trade as the wrong human or fail headless demos. | Prefer participant-scoped tokens for demos. Future hardening should reject global tokens for `place_prediction` unless explicitly marked headless-agent-only. |
| Payment status audit | Failed/canceled payment status changes previously had weaker local audit coverage than credited payments. | Operators need a complete audit trail after the event. | Local and Supabase settlement paths now write `payment_status` audit rows for failed/canceled transitions. Before doors open, force one failed/canceled test checkout and confirm `/admin/audit` records it without issuing MegaBucks. |
| Deployed readiness proof | A green local build does not prove public QR, checkout callback, admin, and stage URLs. | The event operator needs external proof links before doors open. | Set all `NEXT_PUBLIC_PROOF_*` URLs and run `READINESS_URL=https://<domain> npm run verify:deploy`. |
| Production-path load proof | `npm run load:500` exercises the market engine locally, not HTTP routes or Supabase RPCs under concurrent request pressure. | A local engine p99 is useful, but it does not prove the deployed stack can absorb a 500-person room. | Add a `load:500:supabase` or HTTP load script that creates sessions, completes profiles, places concurrent predictions with idempotency retries, runs a subset of checkouts, then locks/resolves through admin/API paths and verifies ledger/aggregate invariants. |
| Participant moderation transaction | Supabase participant moderation still uses snapshot patching rather than one transactional RPC. | A ban/hide/rename during active betting should update participant state and affected aggregates atomically. | Add `moderate_participant_tx(participant_id, action, nickname, ip)` with row locks and in-transaction aggregate recompute, route `/api/admin/participants` through it, and add readiness/static coverage. |
| MCP read scoping | Unauthenticated MCP market reads previously enumerated every open event. | Side-event or test-room market metadata should not leak through default agent discovery. | MCP read-only tools now scope unauthenticated reads to `eventSlug` or the configured default event, while participant tokens stay scoped to their participant event. Route-handler coverage verifies default and explicit event behavior. |

## Minor Findings

| Issue | What to check | Required fix / validation |
| --- | --- | --- |
| Copy clarity | Whale Guard and blind launch copy should explain caps without raw errors. | Try first prediction, add-on, cooldown, and blocked large action on mobile. |
| Receipt wrapping | Long team names, handles, and share URLs should wrap instead of overflowing. | Create one long-name receipt and view it on a narrow phone. |
| Admin situational awareness | Operators need a fast way to see readiness, audit log, participants, payments, and stage mode. | Keep `/admin/readiness`, `/admin/audit`, `/admin/participants`, `/admin/payments`, and `/admin/stage` open in separate tabs. |
| Mobile market discovery | Mobile event home should expose the next several open cards without requiring a disclosure tap. | Current mobile event home shows the top three sorted markets by default, then collapses only the remainder. Validate with the real event market count. |
| Persistent stage QR | The stage QR should remain legible outside join mode. | Persistent stage QR is enlarged; still validate from the back of the room on the actual projector. |

## Systemic Patterns

- Local and Supabase logic can drift. Every market engine rule needs both a local test and a Supabase migration/static assertion.
- Stage visibility is a separate lifecycle concern from market status. Any admin action that hides, voids, locks, or resolves a market must also update featured stage state.
- Mobile sessions are fragile when they depend on network identity. Recovery must rely on stable browser-held guard state, not IP or user agent.
- Human, role, and agent signals must remain separate all the way from aggregation to display and history charts.
- Readiness requires deployed evidence. Passing unit tests is necessary, but not sufficient for a live room.

## Sequenced Roadmap

1. Apply Supabase migrations through `034` and run `npm run verify:deploy` against the deployed domain.
2. Run `npm run load:500` locally before the final deploy to confirm the market engine can process 500 participant journeys, idempotent retries, and winner-pool settlement.
3. Run `npm run e2e:local` on a machine with Docker, local Supabase, and Playwright browsers installed or installable.
4. Run the critical smoke flow with two phones and one laptop: join, profile, predict, switch, blocked cap, checkout, void redirect, lock, resolve, receipt, leaderboard, and stage reveal.
5. Run the admin operator flow: login, create/open/feature/lock/resolve/void a throwaway market, switch all stage modes, inspect audit logs, and reconcile payments.
6. Run the projector flow: `/stage/megathon-2026` on the real screen, QR scan from the back of the room, live updates, blind launch unlock, role battle, humans vs agents, leaderboard, and resolution reveal.
7. Freeze market content and environment variables. After freeze, only fix P0/P1 regressions found during the smoke run.

## Parallel Work

- One engineer owns Supabase migration/readiness verification.
- One engineer owns participant mobile smoke testing on iOS and Android or two different mobile browsers.
- One engineer owns admin/stage/projector flow and keeps screenshots/proof URLs updated.
- One operator rehearses the exact stage sequence with the MC script.

## Go/No-Go Gate

Go live only when:

- `npm run verify:deploy` passes against the public domain.
- `npm run load:500` passes locally.
- `npm run e2e:local` passes against local Supabase on desktop and mobile Playwright projects.
- `/admin/readiness` has no failed checks.
- At least two real mobile devices complete the participant smoke flow.
- Admin can resolve a throwaway market and settlement appears in leaderboard/receipt.
- The projector stage page survives a full rehearsal without reload-only fixes.
