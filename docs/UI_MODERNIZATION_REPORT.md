# UI/UX Modernization Report — LOOK MVP

**Date:** 11 June 2026  
**Scope:** Visual overhaul without changing business logic

---

## Summary

The LOOK MVP received a full mobile-first UI refresh inspired by modern marketplace apps (Uber, Yandex Go, Avito, Bolt, Airbnb). All existing user flows remain intact: registration, login, order creation, search, provider offers, accept/reject, and chat.

### Design system

- **Typography:** Plus Jakarta Sans (Latin + Cyrillic)
- **Colors:** Brand gradient (indigo → violet), semantic status colors, slate neutrals
- **Components:** Card, PageHeader, Select, Chip, Skeleton, EmptyState, AuthLayout
- **Layout:** Glass header with user avatar, floating bottom navigation with blur/shadow
- **Status badges:** Dot indicators — Открыт, В ожидании, В работе, Завершён, Отменён

### Registration & profile

- **Multi-step registration:** Role → basic info → provider fields (for provider/both)
- **Customer fields:** name, email, phone, country, city, avatar URL
- **Provider fields:** experience (bio), skills, portfolio, service categories
- **Role «Оба»:** Full customer + provider capabilities with explanatory hints
- **Migration `010_profile_extended_fields.sql`:** `phone`, `skills`, `portfolio`, `provider_category_slugs`

---

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ Pass |
| `npm run build` | ✅ Pass |
| `npm run test:roles` | ✅ 9/9 checks passed |
| Screenshots | ✅ 9 screens captured |

**Note:** Apply migration in Supabase SQL Editor:
`supabase/migrations/010_profile_extended_fields.sql`

---

## Screenshots

Located in `docs/screenshots/`:

| File | Screen |
|------|--------|
| `01-home.png` | Главная |
| `02-search.png` | Поиск |
| `03-login.png` | Вход |
| `04-register.png` | Регистрация (шаг 1) |
| `05-profile.png` | Профиль (guest state) |
| `06-new-request.png` | Создание заказа |
| `07-chat.png` | Чаты |
| `08-my-requests.png` | Мои запросы |
| `09-my-offers.png` | Мои предложения |

Re-capture: `node scripts/capture-screenshots.mjs` (dev server on `localhost:3000`)

---

## Changed files

### Design system & layout
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/components/ui/Button.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Textarea.tsx`
- `src/components/ui/Avatar.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/Card.tsx` *(new)*
- `src/components/ui/PageHeader.tsx` *(new)*
- `src/components/ui/Select.tsx` *(new)*
- `src/components/ui/Chip.tsx` *(new)*
- `src/components/ui/Skeleton.tsx` *(new)*
- `src/components/ui/EmptyState.tsx` *(new)*
- `src/components/layout/AppLayout.tsx`
- `src/components/layout/BottomNav.tsx`
- `src/components/layout/AuthLayout.tsx` *(new)*

### Pages
- `src/app/page.tsx` — Home
- `src/app/search/page.tsx` — Search
- `src/app/(auth)/login/page.tsx` — Login
- `src/app/(auth)/register/page.tsx` — Register (multi-step)
- `src/app/profile/page.tsx` — Profile & edit
- `src/app/requests/new/page.tsx` — Create request
- `src/app/requests/[id]/page.tsx` — Request detail
- `src/app/requests/[id]/offer/page.tsx` — Submit offer
- `src/app/my/requests/page.tsx` — My requests
- `src/app/my/offers/page.tsx` — My offers
- `src/app/chat/page.tsx` — Chat list
- `src/app/chat/[id]/page.tsx` — Chat thread

### Components
- `src/components/home/HomeHero.tsx`
- `src/components/categories/CategoryGrid.tsx`
- `src/components/requests/RequestCard.tsx`
- `src/components/requests/RequestDetailCard.tsx` *(new)*
- `src/components/requests/RequestLifecycleActions.tsx`
- `src/components/offers/OfferCard.tsx`
- `src/components/chat/ConversationItem.tsx`
- `src/components/chat/MessageList.tsx`
- `src/components/chat/MessageInput.tsx`
- `src/components/profile/CategoryMultiSelect.tsx` *(new)*

### Data & types
- `src/types/index.ts`
- `src/lib/validations.ts`
- `src/lib/auth/profile-fallback.ts`
- `src/lib/mock/data.ts`
- `supabase/migrations/010_profile_extended_fields.sql` *(new)*

### Tooling
- `scripts/capture-screenshots.mjs` *(new)*

---

## Business logic preserved

No changes to:
- Supabase RPCs for offers (accept/reject)
- Request lifecycle (complete/cancel)
- Role helpers (`canActAsProvider`, `canRespondToRequest`, `isRequestOwner`)
- AuthProvider session handling
- API routes and server actions
