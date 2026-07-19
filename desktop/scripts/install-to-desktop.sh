#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${DESKTOP_DIR}/.." && pwd)"
APP_PATH="${DESKTOP_DIR}/dist/LOOK.app"
TARGET="${HOME}/Desktop/LOOK.app"

if [[ ! -d "${APP_PATH}" ]] || [[ ! -f "${APP_PATH}/Contents/Resources/resolve-project-root.sh" ]]; then
  echo "==> Building LOOK.app..."
  bash "${SCRIPT_DIR}/build-mac-app.sh"
else
  echo "==> Refreshing LOOK.app..."
  bash "${SCRIPT_DIR}/build-mac-app.sh"
fi

echo "==> Installing LOOK.app to Desktop"

if [[ -d "${TARGET}" ]]; then
  rm -rf "${TARGET}"
fi

cp -R "${APP_PATH}" "${TARGET}"
xattr -cr "${TARGET}" 2>/dev/null || true

# Refresh default project path inside installed app
printf '%s\n' "${PROJECT_ROOT}" > "${TARGET}/Contents/Resources/look-project-path.txt"

echo "✅ Installed: ${TARGET}"
echo "   Double-click LOOK on your Desktop to launch."
