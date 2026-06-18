# Financial MVP Report — LOOK (Test Mode)

**Date:** June 2026  
**Scope:** Test financial layer without Stripe / real payments  
**Future:** Stripe Connect + LOOK entity in UAE

---

## Summary

Implemented a full **test financial contour**: database schema, 15% platform commission (configurable), provider balance, platform balance, transaction history, and UI payment flow on orders.

| Stage | Status |
|-------|--------|
| 1. Database (5 tables + RLS) | ✅ |
| 2. 15% LOOK commission | ✅ |
| 3. Provider balance UI | ✅ |
| 4. Platform balance UI | ✅ |
| 5. Transaction history | ✅ |
| 6. Test payment flow | ✅ |

---

## Tables created

| Table | Purpose |
|-------|---------|
| `payments` | One test payment per order (gross, fee, provider share) |
| `transactions` | Immutable ledger (5 operation types) |
| `provider_balances` | Available / pending / total earned per provider |
| `platform_commissions` | LOOK commission per payment |
| `payouts` | Test provider withdrawals |
| `platform_settings` | Config key `commission_rate` (default 0.15) |

Also: `profiles.is_platform_admin` + seed user `admin@test.look` / `Test1234!`

---

## Migrations

| File | Description |
|------|-------------|
| `supabase/migrations/012_financial_core.sql` | All financial tables, RLS, RPCs, admin seed |

**Apply in Supabase SQL Editor** (after migrations 001–011).

### RPC functions

- `simulate_test_payment(request_id)` — customer pays in_progress order
- `simulate_test_payout(amount?)` — provider withdraws available balance
- `simulate_test_refund(request_id)` — test refund
- `complete_request` — updated: requires paid payment + increments `completed_orders_count`

---

## Commission (15%)

Config:
- DB: `platform_settings.commission_rate = 0.15`
- App: `NEXT_PUBLIC_PLATFORM_COMMISSION_RATE=0.15` in `.env.local`

Example: **$1000** → LOOK **$150** → Provider **$850**

Auto-calculated in `simulate_test_payment` RPC and `src/lib/config/finance.ts`.

---

## New pages

| Route | Access | Description |
|-------|--------|-------------|
| `/my/balance` | Provider | Available, pending, total earned, recent ops |
| `/admin/platform` | Admin (demo: all) | Platform revenue, commissions, volume |
| `/finance/transactions` | Authenticated | Full transaction history (RLS-filtered) |

Links added on `/profile` under **Финансы (тест)**.

---

## New API routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/finance/payments/[requestId]` | Payment status for order |
| POST | `/api/finance/payments/[requestId]` | Simulate test payment |
| GET | `/api/finance/provider-balance` | Provider balance |
| POST | `/api/finance/provider-balance` | Simulate test payout |
| GET | `/api/finance/platform-summary` | Admin platform stats |
| GET | `/api/finance/transactions` | Transaction list |

---

## RLS summary

| Table | Provider | Customer | Admin |
|-------|----------|----------|-------|
| `payments` | Own orders | Own orders | All |
| `transactions` | Own rows | Payment-related | All |
| `provider_balances` | Own row | — | All |
| `platform_commissions` | — | — | All |
| `payouts` | Own rows | — | All |

Writes only via **SECURITY DEFINER** RPCs (no direct client inserts).

---

## Test financial cycle

```
1. Accept offer        → request status in_progress
2. Customer pays       → POST /api/finance/payments/[id]  (test)
   ├─ payment paid
   ├─ platform_commission 15%
   ├─ provider_balances += 85%
   └─ transactions × 3
3. Complete order      → POST /api/requests/[id]/complete
4. Provider balance    → /my/balance
5. Platform balance    → /admin/platform (admin@test.look)
6. History             → /finance/transactions
```

### Test accounts

| Email | Password | Role |
|-------|----------|------|
| customer@test.look | Test1234! | Pay & complete |
| provider@test.look | Test1234! | View balance |
| admin@test.look | Test1234! | Platform dashboard |

### Verification

```bash
npm run test:finance   # commission math
npm run typecheck
npm run build
npm run test:roles
```

---

## New / changed files

### Migration
- `supabase/migrations/012_financial_core.sql`

### Config & data
- `src/lib/config/finance.ts`
- `src/lib/data/finance-actions.ts`
- `src/lib/api/finance-auth.ts`
- `src/lib/mock/finance.ts`

### API
- `src/app/api/finance/payments/[id]/route.ts`
- `src/app/api/finance/provider-balance/route.ts`
- `src/app/api/finance/platform-summary/route.ts`
- `src/app/api/finance/transactions/route.ts`

### UI
- `src/components/finance/*` (5 components)
- `src/app/my/balance/page.tsx`
- `src/app/admin/platform/page.tsx`
- `src/app/finance/transactions/page.tsx`
- `src/components/finance/RequestTestPayment.tsx` on order detail
- `src/app/profile/page.tsx` — finance links

### Types
- `src/types/index.ts` — Payment, Transaction, balances

### Scripts
- `scripts/verify-financial-cycle.mjs`

---

## Screenshots

Capture after applying migration 012 and running test flow:

- `docs/screenshots/12-payment-test.png` — order payment card
- `docs/screenshots/13-provider-balance.png` — /my/balance
- `docs/screenshots/14-platform-balance.png` — /admin/platform
- `docs/screenshots/15-transactions.png` — /finance/transactions

---

## Not in scope (by design)

- Stripe / Stripe Connect
- Real card payments
- UAE entity onboarding
- Production deployment

---

## Next steps (future)

1. Stripe Connect Express onboarding for providers
2. PaymentIntent on order accept
3. Automatic payout schedule
4. Multi-currency (AED + USD)
5. Tax / VAT for UAE entity
