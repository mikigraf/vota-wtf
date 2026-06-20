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

Run the deployment gate after setting `READINESS_URL` to the deployed origin or `/api/readiness` URL:

```bash
READINESS_URL=https://your-deploy.example npm run verify:deploy
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

The migrations create the `avatars` and `market-images` storage buckets, seed the MEGATHON event/cards, lock down public table access, and grant transactional RPC functions to `service_role`. For the current live-event build, production must include every migration through `supabase/migrations/028_human_room_signal_snapshot.sql`.

Production Supabase auto-seeding is disabled by default. Leave `VOTA_ENABLE_PRODUCTION_AUTO_SEED` unset for the live event so demo seed markets and participants cannot be inserted on first read.

Deploy the app on Vercel:

1. Import this repository as a Vercel project.
2. Keep the framework preset as `Next.js`.
3. Use the committed `vercel.json` defaults: `npm install`, `npm run build`, `npm run dev`.
4. Add the production environment variables from `.env.example`.
5. Set `NEXT_PUBLIC_BASE_URL` to the deployed HTTPS origin or custom domain.
6. Deploy, then run:

```bash
READINESS_URL=https://your-vercel-domain.example npm run verify:deploy
```

After the first successful test checkout, set `MOLLIE_READINESS_PAYMENT_ID` to a successful Mollie test payment id from the same Mollie test account and redeploy. `/api/readiness` is the public deploy gate; `/admin/readiness` shows the full admin-only readiness detail after login.

## Production Environment

Required for deployment:

```txt
ADMIN_PASSWORD=<strong random password>
ADMIN_SESSION_SECRET=<long random secret>
NEXT_PUBLIC_EVENT_SLUG=megathon-2026
VOTA_DATA_BACKEND=supabase
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_BASE_URL=https://your-deploy.example
NEXT_PUBLIC_QR_BASE_URL=https://vota.wtf
APP_URL=https://your-deploy.example
WEBHOOK_BASE_URL=https://your-deploy.example
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

GitHub Actions runs `npm install` and `npm run verify` on pushes to `main` and pull requests. The repo intentionally does not require Playwright for the current demo gate; the node test suite exercises the join, prediction, checkout, admin, readiness, MCP, and receipt flows through route handlers.
