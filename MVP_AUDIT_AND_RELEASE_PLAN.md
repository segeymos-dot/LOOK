# LOOK — CTO-аудит и план до первого релиза

**Дата аудита:** 11 июня 2026  
**Версия проекта:** 0.1.0  
**Стек:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase · Zod

---

## Резюме для руководства

LOOK — мобильно-ориентированный маркетплейс услуг (заказчик публикует запрос → исполнитель отправляет предложение → переговоры в чате). Архитектурный каркас и UI-скелет **хорошо продуманы**, но проект **не готов к production-релизу**.

| Критерий | Оценка |
|----------|--------|
| UI/UX прототип (демо) | ~75% |
| Backend-схема (Supabase) | ~85% |
| Интеграция frontend ↔ backend | ~55% |
| Ключевой бизнес-флоу (accept offer → in progress) | ~15% |
| Production build | **Не проходит** |
| Тесты / CI / документация | ~5% |
| **Готовность MVP к запуску** | **~40%** |

**Вердикт:** можно показывать инвесторам/пользователям **демо-прототип**, но **нельзя** выпускать как рабочий продукт без 2–4 недель доработки (минимум 1 неделя на блокеры).

---

## 1. Структура проекта

```
LOOK/
├── public/
│   └── manifest.json          # PWA-манифест (иконки отсутствуют)
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/            # login, register
│   │   ├── chat/              # список чатов + [id]
│   │   ├── my/                # requests, offers
│   │   ├── profile/
│   │   ├── requests/          # new, [id], [id]/offer
│   │   ├── search/
│   │   ├── layout.tsx
│   │   └── page.tsx           # главная
│   ├── components/
│   │   ├── categories/
│   │   ├── chat/
│   │   ├── layout/            # AppLayout, BottomNav, DemoBanner
│   │   ├── offers/
│   │   ├── requests/
│   │   └── ui/                # Button, Input, Badge, Avatar...
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useMessages.ts
│   ├── lib/
│   │   ├── config.ts          # определение demo-режима
│   │   ├── mock/data.ts       # mock-данные для демо
│   │   ├── supabase/          # client, server, middleware
│   │   ├── utils.ts
│   │   └── validations.ts     # Zod-схемы
│   ├── types/index.ts         # ручные TS-типы (без gen-types)
│   └── middleware.ts          # auth guard
├── supabase/
│   ├── config.toml
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.example
└── package.json
```

### Архитектурные решения

- **Dual-mode:** demo (mock) / production (Supabase). Переключение через `isDemoMode()` в `src/lib/config.ts` — автоматически включается, если нет `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Mobile-first:** `max-w-lg`, bottom navigation, PWA manifest.
- **Server + Client Components:** списки (home, my/*, chat list) — RSC; формы и чат — client.
- **RLS в Supabase:** политики безопасности на уровне БД уже описаны в миграции.
- **Realtime:** подписка на `messages` через Supabase Realtime в `useMessages`.

### Что отсутствует в структуре

- `README.md` — нет инструкции по запуску и деплою
- `src/types/database.types.ts` — скрипт `supabase:gen-types` есть, файл не сгенерирован
- Тесты (`*.test.ts`, `*.spec.ts`) — **0 файлов**
- CI/CD (`.github/workflows`) — **нет**
- `public/icons/` — иконки для PWA указаны в manifest, но **не существуют**
- API routes / Server Actions — вся логика на клиенте через Supabase JS
- Error boundaries, loading.tsx, not-found.tsx — **нет**

---

## 2. Карта функциональности

### Реализовано (работает)

| Модуль | Demo | Supabase | Комментарий |
|--------|------|----------|-------------|
| Главная (категории + запросы) | ✅ | ✅ | |
| Поиск + фильтр по категории | ✅ | ✅ | Debounce 300ms |
| Создание запроса | ✅ (fake) | ✅ | В demo редирект на `req-1` |
| Просмотр запроса | ✅ | ⚠️ | **Build сломан** — см. блокеры |
| Отправка предложения | ✅ (fake) | ✅ | + auto-create conversation |
| Список «Мои запросы» | ✅ | ✅ | |
| Список «Мои предложения» | ✅ | ✅ | |
| Регистрация / вход | ✅ (fake) | ✅ | Без email confirmation UX |
| Профиль (просмотр/редактирование) | ✅ (не сохраняет) | ✅ | Без валидации profileSchema |
| Список чатов | ✅ | ✅ | Без last_message / unread |
| Чат (отправка/получение) | ✅ (local) | ✅ | Realtime в prod |
| Auth middleware | — | ✅ | Защита /profile, /my/*, /chat, /requests/new |
| Demo banner | ✅ | — | |

### Недоделано / заглушки

| Функция | Статус | Где видно |
|---------|--------|-----------|
| **Принять / отклонить предложение** | UI есть, логики нет | `OfferCard` — кнопки без `onAccept`/`onReject` |
| Смена статуса запроса (`in_progress`, `completed`, `cancelled`) | Только enum + Badge | Нет UI и API |
| Отзыв предложения (`withdrawn`) | Только enum | Нет UI |
| Рейтинг и отзывы | Mock-данные в профиле | Нет таблицы reviews, нет UI |
| Загрузка аватара | Поле `avatar_url` | Нет Storage integration |
| Счётчик непрочитанных в чатах | Поле `unread_count` в типах | Не загружается из БД |
| Превью последнего сообщения в списке чатов | Поле `last_message` | Не загружается |
| Счётчик предложений на карточке запроса | `offers_count` | Не агрегируется в запросах |
| Выбор валюты | Hardcoded `USD` | Нет UI |
| Email confirmation после регистрации | — | Supabase может требовать, UX не обработан |
| Роль при регистрации | UPDATE после signUp | Может упасть, если email confirmation включён |
| Защита `/requests/[id]/offer` | — | Не в middleware matcher (только client-side redirect) |
| Service Worker / offline PWA | manifest only | SW не реализован |
| Уведомления (push/email) | — | Нет |
| Платежи / escrow | — | Вне scope MVP, но не заложено |
| Модерация / жалобы | — | Нет |
| Админ-панель | — | Нет |
| i18n | RU hardcoded | Нет |
| SEO (og:image, sitemap) | Минимальный metadata | Нет |

---

## 3. Оценка готовности MVP

### MVP-сценарий (минимально жизнеспособный продукт)

> Заказчик создаёт запрос → исполнитель откликается → заказчик принимает предложение → стороны общаются в чате → запрос переводится «в работу».

| Шаг | Готовность |
|-----|------------|
| 1. Регистрация / вход | 80% |
| 2. Создание запроса | 85% |
| 3. Поиск и просмотр запросов | 85% |
| 4. Отправка предложения | 80% |
| 5. **Принятие предложения** | **0%** |
| 6. Чат между сторонами | 70% |
| 7. Завершение заказа | 0% |
| 8. Production deploy | 0% (build fail) |

**Вывод:** MVP **не замкнут** — ключевой шаг «принять предложение» отсутствует. Без него продукт не выполняет свою основную ценность.

### Demo-режим vs Production

Сейчас проект **по умолчанию работает в demo** (без `.env`). Это хорошо для разработки UI, но создаёт риск случайного деплоя «пустышки». Перед релизом нужно:

1. Явно требовать Supabase credentials в production
2. Fail-fast при старте без env (или `NEXT_PUBLIC_USE_MOCK_DATA=false` + проверка)
3. Убрать `'use client'` с server pages

---

## 4. Критические ошибки (исправить в первую очередь)

### P0 — блокеры релиза

#### 1. Production build не проходит

```
./src/app/requests/[id]/page.tsx
'use client' + async function + import from @/lib/supabase/server (next/headers)
```

**Проблема:** страница помечена как Client Component (`'use client'`), но написана как async Server Component и импортирует `createClient` из `server.ts`.

**Исправление:** удалить `'use client'`. Страница должна быть Server Component (как `my/requests/page.tsx`).

**Файл:** `src/app/requests/[id]/page.tsx`, строка 1.

---

#### 2. TypeScript errors — `npm run typecheck` падает

```
src/lib/supabase/middleware.ts — implicit any в cookiesToSet
src/lib/supabase/server.ts — implicit any в cookiesToSet
```

**Исправление:** типизировать callback по документации `@supabase/ssr`:

```typescript
setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) { ... }
```

---

#### 3. Принятие/отклонение предложений — мёртвый UI

`OfferCard` рендерит кнопки «Принять» / «Отклонить», но на странице запроса handlers **не переданы**. Клик ничего не делает.

**Нужно реализовать:**

- `acceptOffer(offerId)`:
  - UPDATE `offers` SET status = `'accepted'` WHERE id = offerId
  - UPDATE других offers на этом request → `'rejected'`
  - UPDATE `requests` SET status = `'in_progress'`
  - (опционально) создать/активировать conversation
- `rejectOffer(offerId)`:
  - UPDATE offer SET status = `'rejected'`

**Файлы:** `src/app/requests/[id]/page.tsx`, новый client-компонент или Server Action.

---

### P1 — высокий приоритет

#### 4. Регистрация: роль может не сохраниться

`register/page.tsx` делает `profiles.update({ role })` сразу после `signUp`. Если в Supabase включено **email confirmation**, пользователь ещё не авторизован → UPDATE заблокирован RLS.

**Исправление:** передавать `role` в `raw_user_meta_data` при signUp и обновить trigger `handle_new_user()` для записи role.

---

#### 5. Middleware не защищает `/requests/*/offer`

Защищены: `/profile`, `/requests/new`, `/chat`, `/my`.  
Страница `/requests/[id]/offer` полагается только на client-side redirect.

**Исправление:** добавить в `isProtectedRoute` паттерн для offer-страниц.

---

#### 6. PWA-иконки отсутствуют

`manifest.json` ссылается на `/icons/icon-192.png` и `/icons/icon-512.png`, но в `public/` только `manifest.json`.

**Исправление:** добавить иконки или убрать ссылки до готовности.

---

#### 7. Нет `database.types.ts`

Supabase-запросы не типизированы generated types → выше риск runtime-ошибок при изменении схемы.

**Исправление:** `npm run supabase:gen-types` после деплоя миграции.

---

### P2 — качество и UX

| # | Проблема | Рекомендация |
|---|----------|--------------|
| 8 | Нет error handling на server pages | `error.tsx`, try/catch + UI ошибок |
| 9 | Profile save без feedback | Toast / error state после update |
| 10 | Chat list без preview сообщений | JOIN last message в select |
| 11 | `read_at` не обновляется | Mark-as-read при открытии чата |
| 12 | Demo login не устанавливает auth state | useAuth в demo всегда logged-in как mock user — login form бесполезен для теста logout flow |
| 13 | Нет README | Добавить setup guide |
| 14 | Валюта USD при русскоязычном UI | RUB по умолчанию или selector |

---

## 5. Подробный план до первого релиза

### Фаза 0 — Разблокировка (1–2 дня)

**Цель:** зелёный build + typecheck

- [ ] Убрать `'use client'` с `requests/[id]/page.tsx`
- [ ] Исправить типы в `supabase/server.ts` и `supabase/middleware.ts`
- [ ] Прогнать `npm run typecheck && npm run build && npm run lint`
- [ ] Создать `.env.local` с Supabase credentials
- [ ] Применить миграцию: `supabase db push` или SQL Editor
- [ ] Сгенерировать `database.types.ts`

**Критерий готовности:** `npm run build` exit 0.

---

### Фаза 1 — Замыкание core flow (3–5 дней)

**Цель:** end-to-end сценарий работает на Supabase

- [ ] **Accept/Reject offers** — Server Actions или client mutations + optimistic UI
- [ ] При accept: request → `in_progress`, остальные offers → `rejected`
- [ ] Кнопка «Написать» / link to chat после accept
- [ ] Fix registration role (meta_data + trigger)
- [ ] Middleware: protect `/requests/*/offer`
- [ ] Smoke test вручную по чеклисту (см. ниже)

**Критерий готовности:** два тестовых аккаунта проходят полный цикл за 10 минут.

---

### Фаза 2 — UX и стабильность (3–5 дней)

- [ ] Chat list: last message preview + timestamp
- [ ] Mark messages as read (`read_at`)
- [ ] Loading skeletons (`loading.tsx`) для основных routes
- [ ] Error boundaries (`error.tsx`)
- [ ] Empty states везде (уже частично есть)
- [ ] Toast notifications (success/error)
- [ ] Email confirmation page / resend email
- [ ] Profile validation через `profileSchema`
- [ ] Request detail: link to chat for accepted provider
- [ ] Cancel request / Complete request (минимальный lifecycle)

---

### Фаза 3 — Production readiness (2–3 дня)

- [ ] README: local setup, env vars, Supabase setup, deploy
- [ ] PWA icons + favicon
- [ ] `NEXT_PUBLIC_USE_MOCK_DATA=false` на production
- [ ] Vercel / hosting deploy
- [ ] Supabase production project (отдельный от dev)
- [ ] RLS audit — прогнать типовые attack vectors
- [ ] Rate limiting (Supabase Edge Function или middleware)
- [ ] Basic monitoring (Sentry / Vercel Analytics)
- [ ] Privacy Policy + Terms (минимальные страницы)

---

### Фаза 4 — Post-MVP (backlog v1.1)

- [ ] Reviews & ratings (таблица + UI)
- [ ] Avatar upload (Supabase Storage)
- [ ] Push notifications
- [ ] Provider portfolio / skills
- [ ] Admin moderation
- [ ] E2E tests (Playwright)
- [ ] CI pipeline (lint + typecheck + build on PR)

---

## 6. Smoke test чеклист перед релизом

```
[ ] Регистрация нового пользователя (customer)
[ ] Регистрация второго пользователя (provider)
[ ] Provider: поиск открытых запросов
[ ] Customer: создание запроса с категорией и бюджетом
[ ] Provider: отправка предложения с ценой и сообщением
[ ] Customer: видит предложение на странице запроса
[ ] Customer: принимает предложение
[ ] Request status = in_progress
[ ] Оба пользователя видят чат
[ ] Realtime: сообщение появляется у второго пользователя без refresh
[ ] Customer: завершение / отмена запроса
[ ] Logout / Login
[ ] Mobile viewport (375px) — все экраны читаемы
[ ] Production URL — demo banner НЕ показывается
```

---

## 7. Технический долг

| Область | Долг | Влияние |
|---------|------|---------|
| Dual-mode branching | `if (isDemoMode())` в каждом файле | Сложность поддержки, дублирование |
| Нет Server Actions | Вся мутация через browser Supabase client | Сложнее централизовать логику |
| Ручные типы | Расхождение с БД | Runtime bugs |
| Client-side auth checks | Middleware + дубли в компонентах | Edge cases |
| Нет тестов | Регрессии при каждом изменении | Высокое |

**Рекомендация CTO:** после MVP v1.0 рефакторить demo-mode в MSW/Storybook, а production logic вынести в Server Actions + typed Supabase client.

---

## 8. Оценка сроков

| Сценарий | Срок | Результат |
|----------|------|-----------|
| **Минимальный hotfix** | 1 неделя | Build OK + accept offer + deploy |
| **MVP v1.0 (рекомендуется)** | 2–3 недели | Core flow + UX polish + docs |
| **MVP + reviews + avatars** | 4–5 недель | Полноценный marketplace v1 |

---

## 9. Приоритетный backlog (Top 10)

1. 🔴 Fix `requests/[id]/page.tsx` — убрать `'use client'` (build blocker)
2. 🔴 Fix TypeScript errors в Supabase helpers
3. 🔴 Implement accept/reject offer flow
4. 🟠 Fix registration role persistence
5. 🟠 Deploy Supabase migration to production
6. 🟠 Add README + env documentation
7. 🟡 Chat list improvements (last message, read status)
8. 🟡 Request lifecycle (complete/cancel)
9. 🟡 PWA icons + favicon
10. 🟡 E2E smoke tests

---

## 10. Заключение

LOOK имеет **сильный фундамент**: продуманная схема БД с RLS, чистый mobile UI, разумное разделение demo/production, realtime-чат. Команда явно двигалась по принципу «UI first, backend second».

Однако проект находится в состоянии **«демо-прототип с частичной backend-интеграцией»**, а не готового MVP. Главные пробелы — **сломанный production build**, **отсутствие accept offer flow** и **нулевое тестовое/деплой покрытие**.

**Рекомендация:** не анонсировать публичный запуск до завершения Фазы 0 + Фазы 1. После этого возможен закрытый beta с 20–50 пользователями.

---

*Документ сгенерирован автоматически на основе статического анализа кодовой базы, `npm run typecheck`, `npm run build`, `npm run lint`.*
