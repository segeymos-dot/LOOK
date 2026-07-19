# LOOK — локальное приложение для Mac

Обёртка Electron запускает LOOK в отдельном окне (без Cursor и без браузера).  
Функционал LOOK не меняется: приложение поднимает `npm run start` на порту **3010** и открывает `http://127.0.0.1:3010`.

Порт 3010 выбран специально, чтобы не конфликтовать с `npm run dev` на `:3000`.

## Требования

- macOS (Apple Silicon или Intel)
- Node.js 18+ и npm (Homebrew или nvm)
- Собранный LOOK: `npm run build` (скрипт сборки сделает это автоматически)
- Файл `.env.local` в корне проекта (как для обычного запуска)

## Сборка и установка на рабочий стол

Из **корня проекта LOOK**:

```bash
# Собрать LOOK.app и скопировать на рабочий стол
npm run desktop:install

# или по шагам:
npm run desktop:build
npm run desktop:install
```

Дважды щёлкните **LOOK** на рабочем столе.

Короткий алиас:

```bash
npm run desktop
```

## Локальная разработка обёртки (без .app)

```bash
npm run desktop:dev
```

Откроется окно Electron; сервер LOOK должен быть доступен на `http://127.0.0.1:3010` (запустится автоматически, если порт свободен).

## Структура

```
desktop/
├── shell/main.cjs          # Окно Electron + запуск next start
├── assets/
│   ├── ICON.md             # Инструкция по иконке
│   └── icon-1024.png       # исходник иконки
├── scripts/
│   ├── build-mac-app.sh    # Сборка LOOK.app (launcher + Info.plist)
│   ├── install-to-desktop.sh
│   └── generate-icon.sh    # PNG → .icns
├── dist/LOOK.app           # Результат сборки (gitignore)
└── package.json            # Electron (локальный runtime)
```

## Как это работает

1. `LOOK.app` — лёгкий launcher: запускает Electron из `desktop/node_modules` и передаёт путь к проекту LOOK.
2. При запуске проверяется порт **3010** — если LOOK уже запущен на нём, окно подключится к нему.
3. Иначе выполняется `npm run start` в каталоге проекта с `PORT=3010` / `LOOK_PORT=3010`.
4. Открывается окно 1280×840 без меню macOS и без интерфейса IDE.

## Иконка

См. [assets/ICON.md](./assets/ICON.md).

## Ограничения (локальное использование)

- Не предназначено для публикации в App Store.
- Требует установленный Node.js на Mac.
- Путь к проекту фиксируется при сборке — после переноса папки LOOK пересоберите `.app`.
- Веб-production (lookcruise.com) не использует localhost; desktop-оболочка — только локальный runtime.
