# Public Provider Profile Page — LOOK MVP

**Date:** June 2026  
**Route:** `/providers/[id]`  
**Audience:** Заказчик, выбирающий исполнителя

---

## Summary

Реализована полноценная **публичная страница исполнителя** — отдельно от личного профиля заказчика (`/profile`). Страница показывает коммерческий профиль в стиле Upwork / Fiverr / YouDo / Avito Услуги и не меняет существующую бизнес-логику заказов, откликов и чата.

---

## Что показывается на странице

| Блок | Компонент |
|------|-----------|
| Фото исполнителя | `Avatar` size `2xl` + hero gradient |
| Имя | H1 в hero |
| Роль «Исполнитель» | Badge с иконкой |
| Рейтинг | Stars + `ProviderStats` |
| Выполненные заказы | `ProviderStats` |
| Отзывы | `ReviewsList` + summary |
| Навыки | Chips |
| Категории услуг | Chips из `provider_category_slugs` |
| Портфолио | `PortfolioGallery` variant `public` (horizontal scroll) |
| О себе | Bio section (placeholder если пусто) |
| Город и страна | Hero location |
| Бейджи проверки | `VerificationBadges` |

---

## Кнопки действий

| Кнопка | Поведение |
|--------|-----------|
| **Написать исполнителю** | Если есть чат → `/chat/[id]`. Иначе → `/requests/new?provider=[id]&intent=contact` (чат открывается после принятия отклика) |
| **Предложить заказ исполнителю** | `/requests/new?provider=[id]` с карточкой исполнителя и автоподстановкой категории |

- На мобильном — sticky bar внизу экрана  
- На desktop — inline-кнопки под статистикой  
- Без авторизации — редирект на login с return URL  
- Свой профиль — кнопка «Редактировать профиль» вместо CTA

---

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ |
| `npm run build` | ✅ |
| `npm run test:roles` | ✅ 9/9 |

---

## Changed files

### New
- `src/components/providers/ProviderPublicProfile.tsx` — layout публичного профиля
- `src/components/providers/ProviderContactBar.tsx` — CTA-кнопки (sticky + inline)
- `src/lib/profile/provider-links.ts` — URL helpers
- `docs/PUBLIC_PROVIDER_PAGE_REPORT.md`

### Modified
- `src/app/providers/[id]/page.tsx` — refactor + metadata SEO
- `src/app/requests/new/page.tsx` — query `?provider=` + `?intent=contact`
- `src/components/profile/PortfolioGallery.tsx` — variant `public`
- `src/components/profile/ReviewsList.tsx` — summary + empty state with title
- `src/components/ui/Avatar.tsx` — size `2xl`

### Unchanged (links only)
- `src/components/offers/OfferCard.tsx` → `/providers/[id]`
- `src/components/offers/OfferDetailView.tsx` → `/providers/[id]`
- `src/app/profile/page.tsx` → «Посмотреть публичный профиль»

---

## How to test

### Demo mode (без Supabase)

1. `npm run dev:clean`
2. Откройте `http://localhost:3000/providers/user-2` (Дмитрий Козлов)
3. Проверьте: hero, stats, skills, categories, portfolio carousel, reviews
4. Кнопки ведут на `/requests/new?provider=user-2`

### Production (Supabase)

1. Войдите как `customer@test.look` / `Test1234!`
2. Откройте заказ с откликами → клик по имени исполнителя в `OfferCard`
3. Или напрямую: `/providers/cdda9bfe-2668-42a9-90e8-d8e4569d6beb` (provider@test.look)
4. **Написать исполнителю** — если чата нет, откроется форма заказа с баннером исполнителя
5. **Предложить заказ** — форма с предзаполненной категорией
6. После принятия отклика кнопка «Написать» ведёт в существующий чат

### Свой профиль исполнителя

1. Войдите как `provider@test.look`
2. `/profile` → «Посмотреть публичный профиль»
3. На публичной странице — «Редактировать профиль», без CTA для заказчика

---

## Architecture notes

- **Не смешивается с `/profile`**: `/profile` — редактирование своего аккаунта; `/providers/[id]` — read-only витрина для заказчиков
- **Чат не ломается**: прямой чат без заказа не создаётся; используется существующий flow «заказ → отклик → принятие → чат»
- **Email badge**: на чужом профиле считается подтверждённым (регистрация через Supabase Auth); на своём — по `email_confirmed_at`
