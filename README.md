# vota.wtf

MEGATHON v7 live no-payout prediction arena built with Next.js, Supabase, and Mollie test-mode checkout proof.

## Local Supabase Runbook

Prerequisites:

- Node 22+
- Docker running
- Supabase CLI 2.75+

Start local Supabase and apply the migrations:

```bash
npm run supabase:start
npm run supabase:reset
```

Generate `.env.local` from the local Supabase status output:

```bash
npm run env:local:supabase
```

Run the app against local Supabase:

```bash
npm run dev:local:supabase
```

The generated local env keeps the rehearsal fallback at `/join/megathon`, while the public root `/` renders the landing page with one participant CTA to `/join/megathon-finals`.

The generated local env block intentionally leaves `MOLLIE_API_KEY` empty. Outside production, that enables the built-in local checkout simulator at `/checkout/test/[purchaseId]` while keeping the production code path test-mode-only for real Mollie keys.

Useful local Supabase URLs after `supabase start`:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- App: `http://127.0.0.1:3000`

## Verification

Run the normal local gate:

```bash
npm run verify
```

Run the local-Supabase gate after `supabase start`:

```bash
npm run verify:local:supabase
```

Run the local 500-user engine gate before a live-room rehearsal:

```bash
npm run load:500
```

`load:500` exercises the market engine directly. `load:500:http` drives real HTTP requests through the production app by default, including session, profile, prediction, and idempotency replay calls:

```bash
LOAD_MARKET_ID=<open-disposable-market-id> LOAD_ALLOW_LIVE=1 npm run load:500:http
```

It defaults to the Megathon production event on `https://vota.wtf`, but live writes are refused unless `LOAD_ALLOW_LIVE=1` and `LOAD_MARKET_ID` points at an open disposable test market. Override `LOAD_ORIGIN` and `LOAD_EVENT_SLUG` when you intentionally want a different target.

Run the no-browser local server smoke gate:

```bash
npm run smoke:json
```

That command creates a temporary local JSON store, seeds `Megathon` and `testingmiki`, starts the production Next server on a free `127.0.0.1` port, and verifies the join, profile, market, prediction, local checkout, stage, admin login, public-state, leaderboard, and readiness HTTP surfaces. It is included after `npm run build` in `npm run verify` so the normal local gate proves the built app serves real pages and APIs even when Playwright browsers are unavailable. In restricted sandboxes that cannot bind a local port, it exits with a clear skip message; `npm run verify:deploy` and `REQUIRE_SMOKE_SERVER=1 npm run smoke:json` make that condition fail.

Run the full browser E2E loop against a fresh local Supabase database:

```bash
npm run e2e:local
```

That command starts local Supabase, resets the database, writes `.env.local`, seeds fresh `Megathon` and `testingmiki` rooms, starts Next on `http://127.0.0.1:3100`, and runs the desktop and mobile Playwright scenarios.

Run the same desktop and mobile Playwright scenarios without Docker/Supabase by using an isolated local JSON store:

```bash
npm run e2e:json
```

That command creates a temporary `VOTA_STORE_FILE`, seeds fresh `Megathon` and `testingmiki` rooms into it, starts Next on `http://127.0.0.1:3100`, and runs the browser tests. Use this as a fast UX regression check when Docker is unavailable; keep `npm run e2e:local` as the production-like Supabase gate.

Run the deployment gate against the canonical public domain:

```bash
READINESS_URL=https://vota.wtf npm run verify:deploy
```

`verify:deploy` requires a reachable readiness endpoint and fails if the deployed app is not ready.

Before a live audience uses the app, run the stage-day smoke plan in [docs/live-event-readiness-plan.md](docs/live-event-readiness-plan.md). The automated gate is necessary, but it does not replace real phone, admin, checkout, stage, and projector validation.

## Supabase + Vercel Deployment

Production is split deliberately:

- Supabase hosts Postgres, Storage buckets, Realtime publication settings, RLS policies, and service-role RPC functions.
- Vercel hosts the TypeScript Next.js app and all server routes.
- Browser clients never receive the Supabase service role key.

Apply the database to the Supabase production project:

```bash
supabase login
supabase link --project-ref <your-supabase-project-ref>
npm run supabase:push
```

The migrations create the `avatars` and `market-images` storage buckets, seed the MEGATHON event/cards, add the Megathon-Finals room, lock down public table access, add hot-path indexes, and grant transactional RPC functions to `service_role`. For the current live-event build, production must include every migration through `supabase/migrations/051_delete_market_readiness_contract.sql`.

Production Supabase auto-seeding is disabled by default. Leave `VOTA_ENABLE_PRODUCTION_AUTO_SEED` unset for the live event so demo seed markets and participants cannot be inserted on first read.

Deploy the app on Vercel:

1. Import this repository as a Vercel project.
2. Keep the framework preset as `Next.js`.
3. Use the committed `vercel.json` defaults: `npm install`, `npm run build`, `npm run dev`.
4. Add the production environment variables from `.env.example`.
5. Set `NEXT_PUBLIC_BASE_URL` to `https://vota.wtf`. Production generated URLs intentionally ignore Vercel preview/deployment hosts.
6. Deploy, then run:

```bash
READINESS_URL=https://vota.wtf npm run verify:deploy
```

After the first successful test checkout, set `MOLLIE_READINESS_PAYMENT_ID` to a successful Mollie test payment id from the same Mollie test account and redeploy. `/api/readiness` is the public deploy gate; `/admin/readiness` shows the full admin-only readiness detail after login.

## Production Environment

Required for deployment:

```txt
ADMIN_PASSWORD=<strong random password>
ADMIN_SESSION_SECRET=<long random secret>
NEXT_PUBLIC_EVENT_SLUG=megathon
VOTA_DATA_BACKEND=supabase
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_BASE_URL=https://vota.wtf
NEXT_PUBLIC_QR_BASE_URL=https://vota.wtf
APP_URL=https://vota.wtf
WEBHOOK_BASE_URL=https://vota.wtf
MOLLIE_API_KEY=test_xxx
MOLLIE_PROFILE_ID=pfl_optional_profile_id
MOLLIE_TESTMODE_ONLY=true
MOLLIE_READINESS_PAYMENT_ID=tr_successful_test_payment
```

Proof links used by `/build` and readiness:

```txt
NEXT_PUBLIC_PROOF_REPO_URL=
NEXT_PUBLIC_PROOF_POSTS_URL=
NEXT_PUBLIC_PROOF_DEMO_URL=
NEXT_PUBLIC_PROOF_CHECKOUT_URL=
NEXT_PUBLIC_PROOF_ADMIN_URL=
NEXT_PUBLIC_PROOF_STAGE_URL=
```

Production must use a Mollie `test_` key. Live Mollie keys, external cash-out mechanics, and payout claims are intentionally out of scope. Correct predictions can settle internal MegaBucks back to wallets.

## CI

GitHub Actions runs `npm install` and `npm run verify` on pushes to `main` and pull requests. The node test suite exercises the join, prediction, checkout, admin, readiness, MCP, and receipt flows through route handlers. For full local browser coverage with multiple real browser users, run `npm run e2e:json` for the no-Docker smoke path and `npm run e2e:local` for the Supabase-backed gate.
