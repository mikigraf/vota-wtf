# vota.wtf - MEGATHON v7 build spec

**Date:** Friday, June 19, 2026  
**Event:** MEGATHON, Amsterdam, June 19-21, 2026  
**Product:** `vota.wtf`  
**Mode:** live no-payout prediction arena  
**Core line:** Markets for what the room believes.  
**v7 correction:** Remove Base44 and Nebius. Use a native Next.js admin route protected by a password. Mollie stays test mode only. Do not use Vapi.

---

## 1. Executive decision

Build `vota.wtf` as one focused Next.js product:

```txt
500 participants scan a QR code -> create nickname + role + photo -> receive Credits -> predict across multiple organizer-created cards -> stage shows the live room signal -> admin locks/resolves -> users get Oracle Score and receipts.
```

This version removes sponsor-runtime complexity. The only required external integration for the demo is **Mollie test mode** for checkout proof. The admin console is not Base44 anymore; it is a native `/admin` route inside the same Next.js app.

### What v7 removes now

```txt
Base44 organizer console
Base44 OpenAPI integration
Nebius AI-agent inference
Vapi voice predictions
Direct Apple Pay implementation
Real payment claims
Cash payout mechanics
Order book / LMSR / market maker
Full user accounts
```

### What v7 keeps

```txt
Next.js + Supabase core app
Password-protected admin route
Mollie test-mode supporter checkout
Multiple prediction cards
Custom prediction amounts
Participant photo/camera onboarding
Roles: Builder / Sponsor / Investor / Other
Whale Guard
People Signal vs Credit Signal
2% virtual provision tracking
Oracle Score leaderboard
Stage screen
Optional MCP/agent interface without Nebius dependency
TAG build-in-public proof
```

### One-sentence pitch

```txt
vota.wtf turns MEGATHON into a live market of belief: builders, sponsors, investors, guests, and optional AI agents predict the winners before the judges reveal them.
```

---

## 2. Product scope for Sunday

### P0 - must work

```txt
QR join flow
Nickname + role + photo/avatar
Anonymous participant session
Starter Credits
Prediction feed with multiple cards
Custom Credit amount per prediction
Whale Guard amount validation
Mollie test-mode +100 Credits checkout
Admin login with password
Admin create/edit/open/lock/resolve/void predictions
Stage screen with live signals
Leaderboard by Oracle Score
2% virtual provision dashboard
```

### P1 - nice if stable

```txt
Role split: Builders vs Sponsors vs Investors vs Other
Shareable “I called it” receipt
Admin photo/nickname moderation
House agents triggered from admin
Human Signal vs Agent Signal toggle
Export CSV
Build-in-public page
```

### P2 - only if everything else is done

```txt
MCP endpoint for external agents
Cala context enrichment
PixVerse promo video/animated receipt
Advanced analytics report
```

### Explicitly out of scope

```txt
Base44
Nebius
Vapi
Live Mollie payments
Apple Pay-specific direct integration
Email/password accounts
Prize redemption
Gift cards
Token transfer
Cash-out
Public user-created markets
```

---

## 3. Stack

Use a boring, fast stack:

```txt
Frontend/backend: Next.js App Router
Hosting: Vercel
Database: Supabase Postgres
Storage: Supabase Storage for avatars and market images
Realtime: Supabase Realtime for stage/admin, polling fallback for participants
Payments: Mollie test mode only
Styling: Tailwind + shadcn/ui
Animation: Framer Motion + canvas-confetti
QR: qrcode.react
Charts/bars: CSS/Tailwind first, chart library only if needed
```

The rule: all sensitive writes go through Next.js server routes. The public client should not write directly to Supabase tables.

---

## 4. App routes

### Public routes

```txt
/                     landing / redirect to active event
/e/[eventSlug]        participant event home
/join/[eventSlug]     QR onboarding
/m/[marketId]         individual prediction card
/stage/[eventSlug]    big screen stage view
/receipt/[id]         optional shareable receipt
```

### Admin routes

```txt
/admin/login          password login
/admin                admin dashboard
/admin/events/[slug]  event control room
/admin/markets/new    create prediction
/admin/markets/[id]   edit/open/lock/resolve prediction
/admin/participants   participants/moderation
/admin/payments       Mollie test checkouts
/admin/agents         optional house agents
/admin/stage          stage controls
```

### API routes

```txt
/api/session/init
/api/session/profile
/api/events/[slug]/public-state
/api/markets/[id]/predict
/api/payments/mollie/create-test-checkout
/api/payments/mollie/webhook
/api/leaderboard/[eventSlug]
/api/admin/login
/api/admin/logout
/api/admin/*
/api/agents/run-house-agent        optional
/mcp                               optional later
```

---

## 5. Password-protected admin design

Use one admin password for the weekend. Do not build full auth.

### Environment variables

```txt
ADMIN_PASSWORD=<strong random password>
ADMIN_SESSION_SECRET=<long random secret>
NEXT_PUBLIC_EVENT_SLUG=megathon-2026
MOLLIE_API_KEY=test_xxx
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=server-only
```

### Login flow

```txt
Admin opens /admin/login
-> enters password
-> server compares against ADMIN_PASSWORD
-> server creates signed HttpOnly cookie
-> redirect to /admin
```

### Cookie rules

```txt
httpOnly: true
secure: true in production
sameSite: lax
maxAge: 12-24 hours
path: /admin and /api/admin
```

### Important security rules

```txt
Do not put the admin password in the frontend bundle.
Do not store the admin password in localStorage.
Do not pass the password in query params.
Do not expose Supabase service role credentials to the client.
All /api/admin routes must verify the admin session cookie.
Add basic login throttling by IP/session if possible.
Add an admin audit log for open/lock/resolve/void/payment-credit actions.
```

### Admin middleware behavior

```txt
/admin/* route without valid cookie -> /admin/login
/api/admin/* without valid cookie -> 401
stage route stays public but stage controls require admin
```

---

## 6. Participant onboarding UX

The join flow must take under 20 seconds.

```txt
Scan QR
-> landing card: “WTF does the room believe?”
-> choose nickname
-> choose role: Builder / Sponsor / Investor / Other
-> add photo: take photo, upload, or skip
-> receive starter Credits
-> first prediction card appears immediately
```

### Photo/camera implementation

Use the simplest browser-native flow:

```html
<input type="file" accept="image/*" capture="user" />
```

Client-side image handling:

```txt
Resize max dimension to 512px
Convert to WebP/JPEG
Strip obvious metadata when possible
Upload to Supabase Storage bucket: avatars
Store avatar_url on participant profile
If skipped, generate emoji/gradient avatar
```

### Role options

```txt
Builder
Sponsor
Investor
Other
```

Stage and admin should use roles for fun splits:

```txt
Builders think Team Orbit.
Sponsors are backing Team Nova.
Investors are split.
Other is pure chaos.
```

---

## 7. Prediction card UX

Each organizer-created prediction is a card:

```txt
Hero image
Category chip
Title
Description
Resolution rule
Status: open / locked / resolved / voided
Outcome cards with image/icon
People Signal
Credit Signal
Your current prediction
Allowed amount
```

### Example card

```txt
Who wins MEGATHON?
Resolution: official final winner announced by the judges.

Team Orbit       34% people signal   41% credit signal
Team Nova        28% people signal   22% credit signal
Team Atlas       19% people signal   17% credit signal
Other            19% people signal   20% credit signal

[100] [250] [Custom] [Lock my take]
```

### Public copy

Use playful but safer words:

```txt
Predict
Commit Credits
Back your take
Boost conviction
Lock my take
WTF did you see first?
```

Avoid in UI where possible:

```txt
bet
wager
gamble
cash-out
payout
real money
odds payout
```

Internally the database can use `stake_amount`, but the UI should say Credits/Prediction/Conviction.

---

## 8. Multiple predictions and custom amounts

Users can participate in many prediction cards.

Recommended behavior:

```txt
One active outcome per participant per market.
User may add more Credits to the same outcome before lock.
User may switch outcome before lock; existing signal moves to the new outcome.
Admin can disable switching per market if needed.
No actions after lock.
```

### Amount picker

```txt
Quick buttons: 100 / 250 / 500
Custom input
Max button based on Whale Guard
Low balance CTA: “Try test checkout +100 Credits”
```

### First action rule

During fair launch:

```txt
First prediction on a market = exactly 100 Credits.
```

After fair launch:

```txt
First prediction can be 100 up to allowed max.
```

---

## 9. No-payout economy

This is the cleanest structure for MEGATHON.

### Credits

```txt
Credits are spendable event currency.
Credits are not money.
Credits cannot be redeemed.
Credits cannot be transferred.
Credits do not cash out.
Credits committed to predictions are consumed/locked for signal.
```

### Oracle Score

```txt
Oracle Score is the leaderboard/reputation metric.
Correct predictions earn Oracle Score.
Early and contrarian correct predictions earn more Oracle Score.
Oracle Score cannot be spent or redeemed.
```

### Why this matters

If users can buy Credits, the leaderboard must not simply rank balances or total spend. Otherwise the winner is the person who clicked the most test checkouts.

The leaderboard should rank:

```txt
accuracy
earliness
contrarian correctness
role-adjusted performance
prediction efficiency
```

Not:

```txt
raw Credits purchased
raw Credits spent
wallet balance
```

---

## 10. 2% virtual provision

Every prediction records a virtual platform fee.

```txt
amount_credits = 100
arena_fee_credits = floor(amount_credits * 0.02)
signal_credits = amount_credits - arena_fee_credits
```

For MEGATHON, this is not real revenue. It is business-model instrumentation.

Admin dashboard should show:

```txt
Total Credits committed
Virtual 2% provision
Mollie test checkouts completed
Projected live supporter revenue
Predictions per participant
Scan-to-first-prediction conversion
```

Pitch line:

```txt
The app already tracks marketplace economics: checkout conversion, Credits issued, Credits committed, and a 2% virtual provision on every prediction.
```

---

## 11. Mollie test mode only

Use Mollie only in test mode.

### User-facing CTA

```txt
Try supporter checkout
Test EUR 1 -> +100 Credits
No real charge in MEGATHON test mode. No payouts. No cash-out.
```

### Flow

```txt
User clicks +100 Credits
-> Next.js server creates purchase row: pending
-> server creates Mollie test payment
-> user redirects to Mollie test checkout
-> webhook/status verification confirms paid test status
-> wallet credited idempotently
-> ledger entry created
-> user returns to app
```

### Rules

```txt
Do not credit from frontend redirect alone.
Credit only after server-side status verification/webhook.
Use idempotency on purchase_id / mollie_payment_id.
Show “test checkout completed,” not “revenue collected.”
```

---

## 12. Whale Guard

Whale Guard prevents one person from buying or receiving too many Credits and flooding the signal.

### Layer 1 - People Signal is primary

Always calculate two signals:

```txt
People Signal = percentage of participants who picked each outcome.
Credit Signal = percentage of signal Credits committed to each outcome.
```

Default stage display:

```txt
Primary: People Signal
Secondary: Credit Signal
```

This means one person with many Credits cannot fully hijack the room signal.

### Layer 2 - fair launch

```txt
First prediction per market = exactly 100 Credits.
Fair launch ends after 25 unique participants, 5,000 signal Credits, or admin override.
```

### Layer 3 - step-up ladder

```txt
next_add_max = max(100, floor(current_user_position * 0.5))
```

Example:

```txt
100 -> add 100 -> total 200
200 -> add 100 -> total 300
300 -> add 150 -> total 450
450 -> add 225 -> total 675
```

### Layer 4 - cooldown

```txt
30 seconds between add-ons to the same market.
```

### Layer 5 - market-share cap

```txt
Max 10% of market signal pool per human.
Max 5% of market signal pool per house agent.
```

### Layer 6 - price-impact cap

```txt
No single action can move Credit Signal by more than 5 percentage points.
```

User message:

```txt
This market cannot absorb that much yet. Max allowed now: 150 Credits.
```

### Final allowed amount

```txt
allowed_add = min(
  available_credits,
  max_action_stake,
  step_up_cap,
  market_share_cap,
  price_impact_cap,
  remaining_user_market_cap
)
```

Recommended defaults:

```txt
initial_stake_amount: 100
max_action_stake: 250
cooldown_seconds: 30
max_human_market_share: 10%
max_agent_market_share: 5%
max_price_impact: 5 percentage points
```

---

## 13. Prediction-market mechanics for the MVP

Support one market type well:

```txt
single-choice categorical market
```

Examples:

```txt
Who wins MEGATHON?
Which category produces the winner?
Will a live demo fail on stage?
Which role predicts best?
Will the judges and crowd agree?
```

### Lifecycle

```txt
draft -> open -> locked -> resolved
              \-> voided
```

### Admin actions

```txt
Draft: edit everything
Open: users can predict
Locked: no more predictions
Resolved: outcome selected, Oracle Score computed
Voided: signal removed/refunded if needed, audit retained
```

### Resolution rule

Every prediction card needs a resolution note:

```txt
Resolution source: official MEGATHON stage announcement.
Resolved by: organizer/admin.
Dispute window: none during live event; admin can void/correct manually.
```

### Defer

```txt
Order books
Limit orders
Sell positions
AMMs/LMSR
Financial odds
User-created public markets
Numeric/range markets
Real probability calibration
```

---

## 14. Scoring

No Credit payouts. Correctness earns Oracle Score only.

### Score formula

```txt
base = signal_credits_committed
correctness = 1 if correct else 0
early_multiplier = 1.0 to 2.0 based on how early the prediction was made
contrarian_multiplier = 1.0 to 2.5 based on how unpopular the winning outcome was at prediction time
role_bonus = optional small multiplier for role battles

oracle_score = base * correctness * early_multiplier * contrarian_multiplier * role_bonus
```

### Receipt copy

```txt
You called Team Orbit before the room did.
Only 11% of people backed it when you locked your take.
+237 Oracle Score
```

### Leaderboards

```txt
Overall Oracle Score
Builders
Sponsors
Investors
Other
Humans vs Agents
Early callers
Contrarian calls
```

---

## 15. Realtime architecture for 500 participants

For 500 people, keep realtime simple but controlled.

### Recommended approach

```txt
Stage/admin: Supabase Realtime subscription to aggregates.
Participants: lightweight polling every 2-5 seconds, with refetch after prediction.
```

This avoids 500 phones all listening to noisy table changes while still making the room feel live.

### Public state endpoint

```txt
GET /api/events/[slug]/public-state
```

Returns compact aggregate JSON:

```json
{
  "event": { "slug": "megathon-2026", "status": "live" },
  "markets": [
    {
      "id": "mkt_1",
      "title": "Who wins MEGATHON?",
      "status": "open",
      "totalParticipants": 312,
      "totalSignalCredits": 28490,
      "outcomes": [
        {
          "id": "team_orbit",
          "label": "Team Orbit",
          "peopleSignal": 0.34,
          "creditSignal": 0.41
        }
      ]
    }
  ]
}
```

### Cache header

```txt
Cache-Control: public, s-maxage=1, stale-while-revalidate=5
```

### After prediction

```txt
User submits prediction
-> API transaction writes ledger/position
-> aggregate updated
-> user refetches public state immediately
-> stage receives realtime update or polls every 1s
```

---

## 16. Database model

Core tables:

```txt
events
participants
participant_sessions
markets
outcomes
positions
prediction_actions
wallets
ledger_entries
market_aggregates
purchases
admin_audit_logs
agent_profiles        optional
agent_runs            optional
mcp_tokens            optional
```

### participants

```txt
id uuid primary key
event_id uuid
participant_type text default 'human' -- human / house_agent / external_agent
nickname text
role text -- builder / sponsor / investor / other
avatar_url text
is_banned boolean default false
created_at timestamptz
```

### markets

```txt
id uuid primary key
event_id uuid
title text
description text
category text
image_url text
status text -- draft/open/locked/resolved/voided
resolution_rule text
resolved_outcome_id uuid
opened_at timestamptz
locked_at timestamptz
resolved_at timestamptz
created_at timestamptz
```

### positions

```txt
id uuid primary key
participant_id uuid
market_id uuid
outcome_id uuid
signal_credits int
fee_credits int
last_action_at timestamptz
created_at timestamptz
updated_at timestamptz
unique(participant_id, market_id)
```

### prediction_actions

Immutable action log:

```txt
id uuid primary key
participant_id uuid
market_id uuid
outcome_id uuid
action_type text -- initial/add/switch/admin_void
amount_credits int
signal_credits int
fee_credits int
people_signal_snapshot jsonb
credit_signal_snapshot jsonb
created_at timestamptz
```

### market_aggregates

Fast read model:

```txt
market_id uuid primary key
total_people int
total_signal_credits int
outcome_people_counts jsonb
outcome_credit_totals jsonb
role_breakdown jsonb
agent_breakdown jsonb
updated_at timestamptz
```

---

## 17. Admin panel requirements

The native Next.js admin is the control room.

### Dashboard

```txt
Event status
Total participants
Active markets
Predictions submitted
Credits committed
Virtual 2% provision
Mollie test checkouts
Stage mode
Emergency pause
```

### Market builder

Fields:

```txt
Title
Description
Category
Hero image
Outcomes with label + image/icon
Resolution rule
Open/lock settings
Fair launch settings
Max action amount
Show on stage toggle
```

Buttons:

```txt
Save draft
Open market
Lock market
Resolve
Void
Feature on stage
```

### Participant moderation

```txt
Search nickname
Filter role
View avatar
Hide avatar
Rename participant
Ban participant
Unban participant
Export participants
```

### Payment/test checkout dashboard

```txt
Pending test purchases
Completed test purchases
Credited purchases
Failed/canceled purchases
Credits issued from test checkout
Projected EUR value
```

### Stage controls

```txt
Join QR mode
Live market mode
Role battle mode
Humans vs Agents mode
Leaderboard mode
Resolution reveal mode
```

---

## 18. Optional agents and MCP without Nebius

Keep the concept, remove the dependency.

### Sunday-safe implementation

House agents can be simple admin-created personas that run through the same prediction API.

```txt
The Builder Agent
The Sponsor Agent
The Investor Agent
The Skeptic Agent
The Chaos Agent
```

For the demo, they can be:

```txt
rule-based
random-weighted
manual-triggered from admin
or connected to any available model later
```

Do not depend on Nebius for this version.

### Separation rule

Agents must never silently distort the human room signal.

Maintain:

```txt
human_signal
agent_signal
combined_signal
```

Default stage:

```txt
Humans first.
Agents as a comparison layer.
```

### MCP remains optional

MCP is a later interface for external AI agents. Keep the tool surface small:

```txt
list_markets
get_market
get_wallet
calculate_allowed_stake
place_prediction
request_more_budget
```

Do not expose:

```txt
buy_tokens
admin actions
resolve market
create market
adjust ledger
execute SQL
```

Agents obey the same Whale Guard rules as humans.

---

## 19. Stage UX

The stage screen should feel like a game show, not a dashboard.

### Join mode

```txt
vota.wtf
WTF does the room believe?
Scan to predict the MEGATHON winners.
No payouts. No cash-out. Just reputation.
```

### Live market mode

```txt
Who wins MEGATHON?

Team Orbit   People 34%   Credits 41%
Team Nova    People 28%   Credits 22%
Team Atlas   People 19%   Credits 17%
Other        People 19%   Credits 20%

312 people in
28,490 Credits committed
```

### Role battle mode

```txt
Builders think: Team Orbit
Sponsors think: Team Nova
Investors think: Team Atlas
Other thinks: chaos
```

### Resolution mode

```txt
The judges chose: Team Orbit
The crowd had it at #1.
Investors missed. Builders called it.

Top Oracles:
1. demo_druid
2. mickey
3. vcwhisperer
```

Use confetti only on resolution. Use small pulse animations on prediction updates.

---

## 20. Build-in-public / TAG plan

Since Base44 and Nebius are removed, TAG becomes more important for sponsor visibility.

### Public proof

```txt
Public GitHub repo or public commit screenshots
Build log page at /build
4-6 posts during the weekend
Short demo clips
Screenshot of Mollie test checkout
Screenshot of admin resolving market
Screenshot of stage screen
```

### Post ideas

```txt
Friday night: “We are turning MEGATHON into a live market of belief.”
Saturday morning: “QR join + prediction cards shipped.”
Saturday afternoon: “Mollie test checkout credits now work.”
Saturday night: “Whale Guard: preventing one rich degen from hijacking the room.”
Sunday: “Humans vs agents at the final ceremony.”
```

---

## 21. Implementation order

Build in this exact order:

```txt
1. Next.js project + Supabase schema
2. Anonymous participant session
3. Join flow with nickname, role, photo/avatar
4. Admin password login
5. Admin market CRUD
6. Public prediction feed
7. Prediction placement transaction
8. Aggregate calculation
9. Stage screen
10. Admin open/lock/resolve/void
11. Oracle Score leaderboard
12. Mollie test checkout + wallet crediting
13. Whale Guard enforcement
14. Admin payment dashboard
15. Role battle stage mode
16. Shareable receipt
17. Optional house agents
18. Optional MCP endpoint
```

Do not start with MCP, agents, PixVerse, or Cala. The live ceremony loop matters first.

---

## 22. Sunday acceptance criteria

The build is successful if this works end to end:

```txt
Organizer opens /admin and logs in with password.
Organizer creates 3-5 prediction cards.
Stage screen shows QR code.
Participant scans QR.
Participant enters nickname, role, and photo.
Participant receives starter Credits.
Participant predicts on multiple cards with custom amounts.
Whale Guard caps oversized actions.
Stage updates People Signal and Credit Signal.
Participant can complete Mollie test checkout and receive +100 Credits.
Admin locks a market.
Admin resolves a market.
Leaderboard updates by Oracle Score.
Receipt appears: “You saw it first.”
Admin sees virtual 2% provision and test checkout metrics.
```

---

## 23. Demo script

```txt
1. Show stage screen with QR.
2. Scan QR on phone.
3. Create profile: nickname, Builder, take/upload photo.
4. Receive starter Credits.
5. Predict “Who wins MEGATHON?” with 100 Credits.
6. Show stage signal move.
7. Try to commit too much; Whale Guard limits it.
8. Click test checkout: +100 Credits via Mollie test mode.
9. Admin opens /admin.
10. Admin creates/opens/locks/resolves prediction.
11. Stage shows resolution and confetti.
12. Leaderboard shows Oracle Score.
13. Admin shows 2% virtual provision and test checkout metrics.
```

### Final pitch line

```txt
vota.wtf is not another polling app. It is a live conviction layer for events: people do not just vote, they put reputation behind what they believe before the result is obvious.
```
