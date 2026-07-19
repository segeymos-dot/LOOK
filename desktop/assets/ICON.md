# Иконка LOOK для Mac (.app)

## Быстрый способ

1. Подготовьте квадратное изображение **1024×1024 px** (PNG, без прозрачности по краям — macOS скруглит сам).
2. Сохраните его как:

   ```
   desktop/assets/icon-1024.png
   ```

3. Сгенерируйте `.icns`:

   ```bash
   bash desktop/scripts/generate-icon.sh
   ```

4. Пересоберите приложение:

   ```bash
   npm run desktop:build
   npm run desktop:install
   ```

5. Если иконка на рабочем столе не обновилась сразу — перезапустите Finder:

   ```bash
   killall Finder
   ```

## Ручной способ (без скрипта)

1. Создайте `icon.iconset` с размерами Apple (см. [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons)).
2. Выполните:

   ```bash
   iconutil -c icns desktop/assets/icon.iconset -o desktop/assets/icon.icns
   ```

3. Пересоберите `LOOK.app`.

## Где используется иконка

| Файл | Назначение |
|------|------------|
| `desktop/assets/icon-1024.png` | Исходник (ваш логотип) |
| `desktop/assets/icon.icns` | Иконка для macOS `.app` |
| `LOOK.app/Contents/Resources/electron.icns` | Встроена при сборке |

## Замена иконки у уже установленного .app

После `npm run desktop:install` проще всего пересобрать приложение.  
Если нужно вручную — замените `AppIcon.icns` внутри бандла и очистите кэш:

```bash
xattr -cr ~/Desktop/LOOK.app
killall Finder
```
