# Financial Contour Test Report — LOOK MVP

**Date:** June 2026  
**Migration:** `012_financial_core.sql`  
**Mode:** Test only (no Stripe)

---

## Executive summary

**Migration 012 applied successfully.** Full financial cycle tested against live Supabase project `qdiyorwbtffknsstmxju`.

| Area | Result |
|------|--------|
| Schema (6 tables) | ✅ |
| RPC `simulate_test_payment` | ✅ |
| RPC `complete_request` (requires payment) | ✅ |
| Commission 15% | ✅ |
| Provider balance credit | ✅ |
| Platform commissions (admin) | ✅ |
| Test payout | ✅ |
| `completed_orders_count` increment | ✅ |

**Errors requiring code fixes:** none.

---

## 1. Schema verification

| Table | REST check | RLS |
|-------|------------|-----|
| `payments` | ✅ | Customer / provider / admin |
| `transactions` | ✅ | Party + admin |
| `provider_balances` | ✅ | Provider own + admin |
| `platform_commissions` | ✅ | Admin only |
| `payouts` | ✅ | Provider own + admin |
| `platform_settings` | ✅ | Admin only |

Additional:
- `profiles.is_platform_admin` — ✅
- `platform_settings.commission_rate` = `0.15` — ✅
- `admin@test.look` — ✅ `is_platform_admin = true`

Automated check: `npm run test:migration-012`

---

## 2. Test scenario executed

### Flow

```
customer@test.look
  → in_progress order (accepted offer)
  → simulate_test_payment (RPC)
  → commission 15% split
  → provider_balances credited
  → complete_request
  → provider@test.look balance verified
  → admin@test.look commissions verified
  → simulate_test_payout $100
```

### Test run A — order `2b2a8734-…` (заказ-1)

| Step | Amount (USD) |
|------|----------------|
| Gross (customer pays) | 5,000.00 |
| LOOK commission (15%) | 750.00 |
| Provider earning | 4,250.00 |

- Payment ID: `f5aabfc1-d7c1-4b0f-bee8-ddfba60cef6b`
- Request completed ✅
- Provider `completed_orders_count`: 0 → 1 ✅
- Payout test: $100 → balance 4,250 → 4,150 ✅

### Test run B — order `df174544-…` (тестовый заказ)

| Step | Amount (USD) |
|------|----------------|
| Gross | 500.00 |
| LOOK commission | 75.00 |
| Provider earning | 425.00 |

- 3 transaction rows created ✅
- Request completed after payment ✅

### Combined provider balance (after both runs − payout)

| Field | Value |
|-------|-------|
| `available_balance` | 4,575.00 USD |
| `total_earned` | 4,675.00 USD |
| Payouts recorded | 1 × $100 |

---

## 3. Table contents (after tests)

### `payments`

2 paid test payments (orders above), `payment_method = test`, status `paid`.

### `transactions`

Per payment, 3 rows:
- `order_payment`
- `platform_commission`
- `provider_earning`

Plus 1 `provider_payout` row from payout test.

### `provider_balances`

1 row for provider `cdda9bfe-…` (provider@test.look).

### `platform_commissions`

2 rows (admin-visible): $750 + $75 = **$825 total LOOK revenue**.

### `payouts`

1 completed test payout: $100.

---

## 4. RLS behaviour (expected, not bugs)

| Viewer | Sees |
|--------|------|
| Customer | Own `payments`, related `transactions` |
| Provider | Own `provider_balances`, `payouts`, payment-linked `transactions` |
| Admin | All tables including `platform_commissions`, `platform_settings` |
| Anonymous | Tables exist but no financial rows |

`platform_commissions` empty for customer/provider queries — **by design** (admin-only RLS).

---

## 5. UI routes (smoke test)

| URL | HTTP |
|-----|------|
| `/` | 200 |
| `/admin/platform` | 200 |
| `/my/balance` | 307 (auth redirect — expected when not logged in) |
| `/finance/transactions` | 200 |

Manual UI test: login → open in_progress order → «Оплатить (тест)» → «Завершить заказ» → `/my/balance`.

Demo without Supabase: `/requests/req-finance` ($1000 USD).

---

## 6. Automated scripts

| Command | Purpose |
|---------|---------|
| `npm run test:migration-012` | Schema + live Supabase cycle |
| `npm run test:finance` | Commission math (offline) |
| `npm run test:roles` | Role guards ✅ |

---

## 7. Test accounts

| Email | Password | Role in test |
|-------|----------|--------------|
| customer@test.look | Test1234! | Pay + complete |
| provider@test.look | Test1234! | View balance |
| admin@test.look | Test1234! | Platform dashboard |

---

## 8. Conclusion

Financial contour is **operational in test mode**. Ready for future Stripe Connect integration without schema redesign.

**Not in scope:** real card payments, Stripe Connect, UAE entity onboarding.

---

## 9. How to re-run tests

```bash
# Full Supabase verification
npm run test:migration-012

# Commission math only
npm run test:finance
```

For a fresh UI test: create new order → accept offer → pay → complete → check balances.
