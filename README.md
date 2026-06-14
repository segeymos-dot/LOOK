# LOOK — Маркетплейс услуг

MVP мобильного приложения для глобального маркетплейса услуг. Заказчики публикуют запросы, исполнители предлагают свои услуги, общение происходит через встроенный чат.

## Стек

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript
- **Стили:** Tailwind CSS 4
- **Backend:** Supabase (Auth, PostgreSQL, Realtime)
- **Валидация:** Zod

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. Скопируйте `.env.example` → `.env.local` и заполните ключи
3. Выполните SQL-миграцию из `supabase/migrations/001_initial_schema.sql` в SQL Editor

### 3. Запуск

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000)

## Структура проекта

```
LOOK/
├── public/
│   └── manifest.json          # PWA manifest
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/            # Страницы авторизации
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── chat/              # Чаты
│   │   │   ├── [id]/          # Диалог
│   │   │   └── page.tsx       # Список чатов
│   │   ├── my/                # Личный кабинет
│   │   │   ├── offers/
│   │   │   └── requests/
│   │   ├── profile/           # Профиль
│   │   ├── requests/          # Запросы
│   │   │   ├── [id]/          # Детали + предложения
│   │   │   │   └── offer/     # Форма предложения
│   │   │   └── new/           # Создание запроса
│   │   ├── search/            # Поиск запросов
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Главная
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                # Базовые UI-компоненты
│   │   ├── layout/            # Layout, навигация
│   │   ├── requests/          # Карточки запросов
│   │   ├── offers/            # Карточки предложений
│   │   ├── chat/              # Компоненты чата
│   │   └── categories/        # Категории услуг
│   ├── hooks/
│   │   ├── useAuth.ts         # Авторизация
│   │   └── useMessages.ts     # Realtime чат
│   ├── lib/
│   │   ├── supabase/          # Supabase клиенты
│   │   ├── validations.ts     # Zod-схемы
│   │   └── utils.ts           # Утилиты
│   ├── types/
│   │   └── index.ts           # TypeScript типы
│   └── middleware.ts            # Auth middleware
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

## Основные сущности

| Сущность | Описание |
|----------|----------|
| **profiles** | Профили пользователей (заказчик / исполнитель) |
| **categories** | Категории услуг |
| **requests** | Запросы заказчиков |
| **offers** | Предложения исполнителей |
| **conversations** | Чат-комнаты |
| **messages** | Сообщения (Realtime) |

## MVP-функции

- [x] Регистрация / авторизация
- [x] Создание запроса с категорией и бюджетом
- [x] Поиск и просмотр запросов
- [x] Отправка предложений исполнителями
- [x] Realtime-чат между заказчиком и исполнителем
- [x] Профиль пользователя
- [x] Mobile-first UI с нижней навигацией
- [x] PWA-ready (manifest)

## Следующие шаги

- Push-уведомления
- Загрузка фото к запросам
- Система отзывов и рейтингов
- Оплата через Stripe
- Нативное приложение (React Native / Capacitor)
- Мультиязычность (i18n)
