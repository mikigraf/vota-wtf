# Live Event Readiness Plan

This plan is the stage-day gate for `vota.wtf`. Automated checks prove the server-side invariants, but the deployed app still needs a real browser and phone smoke test before the room opens.

## Current Evidence

- `npm test`, `npm run lint`, `npm run build`, and local `npm run readiness` are the required code gates.
- `npm run verify:deploy` is the required deployed gate. It fails unless `READINESS_URL` points at the deployed origin or `/api/readiness`.
- Supabase production must have every migration through `supabase/migrations/028_human_room_signal_snapshot.sql` applied.
- This sandbox cannot bind `127.0.0.1:3000`, so local browser and mobile screenshots are not sufficient evidence here.

## Critical Findings

| Issue | What was broken | Why it matters | Required fix / validation |
| --- | --- | --- | --- |
| Market resolution reliability | Supabase resolution previously hit unsafe SQL paths and could conflict with wallet/participant locks. | Admin resolve is the highest-pressure stage action; it cannot fail live. | Apply migrations through `028`, then lock and resolve a throwaway deployed market from `/admin/markets`. Confirm the market moves to resolution mode, winning users receive settlement ledger entries, and `/api/readiness` stays green. |
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
| Resolution reveal fallback | Resolution mode could fail if the currently featured market was unresolved even when another resolved stage market existed. | Operators should be able to hit resolution reveal under pressure without hand-selecting the exact market first. | Apply migration `027`, resolve one market while another unresolved market is featured, then switch to resolution mode without selecting a market. |
| Stage control response shape | Supabase and local stage-control responses diverged. | Admin UI refreshes must behave the same in production as local tests. | Use `/admin/stage` to switch between join, live, role battle, humans vs agents, leaderboard, and resolution. |
| Production auto-seeding | Supabase auto-seeding could insert demo/live seed data on first production read. | Demo markets and participants must not appear in the live event by accident. | Keep `VOTA_ENABLE_PRODUCTION_AUTO_SEED` unset in production unless intentionally reseeding a disposable environment. Confirm root `/` redirects to `/join/${NEXT_PUBLIC_EVENT_SLUG}`. |
| Payment orphan recovery | If Mollie payment creation succeeds but DB attach fails, webhook lookup by Mollie id could miss the purchase. | A paid test checkout could need manual reconciliation. | Webhook/status verification now recovers by reading Mollie metadata `purchaseId` when lookup by Mollie id fails. Still verify one deployed checkout end-to-end before doors open. |
| Runtime DB contract readiness | Static migration tests do not prove the deployed Supabase project has every required RPC signature. | Admin actions can fail if the app deploy is ahead of database migrations. | Add a DB schema-version/contract RPC after the event; for today, manually run migrations through `027` and perform live admin create/open/lock/resolve/void smoke tests. |
| MCP token scope | Admin can still create broad MCP tokens that are easy to misuse during a live demo. | Agents should not accidentally trade as the wrong human or fail headless demos. | Prefer participant-scoped tokens for demos. Future hardening should reject global tokens for `place_prediction` unless explicitly marked headless-agent-only. |
| Payment status audit | Failed/canceled payment status changes are not audited as explicitly as credited payments. | Operators need a complete audit trail after the event. | After the event, add audit rows for failed/canceled/pending terminal checks in local and Supabase payment settlement paths. |
| Deployed readiness proof | A green local build does not prove public QR, checkout callback, admin, and stage URLs. | The event operator needs external proof links before doors open. | Set all `NEXT_PUBLIC_PROOF_*` URLs and run `READINESS_URL=https://<domain> npm run verify:deploy`. |

## Minor Findings

| Issue | What to check | Required fix / validation |
| --- | --- | --- |
| Copy clarity | Whale Guard and blind launch copy should explain caps without raw errors. | Try first prediction, add-on, cooldown, and blocked large action on mobile. |
| Receipt wrapping | Long team names, handles, and share URLs should wrap instead of overflowing. | Create one long-name receipt and view it on a narrow phone. |
| Admin situational awareness | Operators need a fast way to see readiness, audit log, participants, payments, and stage mode. | Keep `/admin/readiness`, `/admin/audit`, `/admin/participants`, `/admin/payments`, and `/admin/stage` open in separate tabs. |

## Systemic Patterns

- Local and Supabase logic can drift. Every market engine rule needs both a local test and a Supabase migration/static assertion.
- Stage visibility is a separate lifecycle concern from market status. Any admin action that hides, voids, locks, or resolves a market must also update featured stage state.
- Mobile sessions are fragile when they depend on network identity. Recovery must rely on stable browser-held guard state, not IP or user agent.
- Human, role, and agent signals must remain separate all the way from aggregation to display and history charts.
- Readiness requires deployed evidence. Passing unit tests is necessary, but not sufficient for a live room.

## Sequenced Roadmap

1. Apply Supabase migrations through `028` and run `npm run verify:deploy` against the deployed domain.
2. Run the critical smoke flow with two phones and one laptop: join, profile, predict, switch, blocked cap, checkout, void redirect, lock, resolve, receipt, leaderboard, and stage reveal.
3. Run the admin operator flow: login, create/open/feature/lock/resolve/void a throwaway market, switch all stage modes, inspect audit logs, and reconcile payments.
4. Run the projector flow: `/stage/megathon-2026` on the real screen, QR scan from the back of the room, live updates, blind launch unlock, role battle, humans vs agents, leaderboard, and resolution reveal.
5. Freeze market content and environment variables. After freeze, only fix P0/P1 regressions found during the smoke run.

## Parallel Work

- One engineer owns Supabase migration/readiness verification.
- One engineer owns participant mobile smoke testing on iOS and Android or two different mobile browsers.
- One engineer owns admin/stage/projector flow and keeps screenshots/proof URLs updated.
- One operator rehearses the exact stage sequence with the MC script.

## Go/No-Go Gate

Go live only when:

- `npm run verify:deploy` passes against the public domain.
- `/admin/readiness` has no failed checks.
- At least two real mobile devices complete the participant smoke flow.
- Admin can resolve a throwaway market and settlement appears in leaderboard/receipt.
- The projector stage page survives a full rehearsal without reload-only fixes.
