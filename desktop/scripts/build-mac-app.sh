#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${DESKTOP_DIR}/.." && pwd)"
APP_DIR="${DESKTOP_DIR}/dist/LOOK.app"
CONTENTS="${APP_DIR}/Contents"
MACOS="${CONTENTS}/MacOS"
RESOURCES="${CONTENTS}/Resources"
APP_ASAR_DIR="${RESOURCES}/app"

echo "==> LOOK Mac app build"
echo "    Project: ${PROJECT_ROOT}"

cd "${DESKTOP_DIR}"

if [[ ! -d node_modules/electron/dist/Electron.app/Contents/Frameworks ]]; then
  echo "==> Installing desktop dependencies..."
  npm install
  echo "==> Downloading Electron runtime..."
  node "${SCRIPT_DIR}/ensure-electron.cjs"
fi

if [[ ! -f "${PROJECT_ROOT}/.next/BUILD_ID" ]]; then
  echo "==> Building LOOK (next build)..."
  (cd "${PROJECT_ROOT}" && npm run build)
fi

printf '%s\n' "${PROJECT_ROOT}" > "${DESKTOP_DIR}/look-project-path.txt"

if [[ -f "${DESKTOP_DIR}/assets/icon-1024.png" && ! -f "${DESKTOP_DIR}/assets/icon.icns" ]]; then
  echo "==> Generating icon.icns from icon-1024.png..."
  bash "${SCRIPT_DIR}/generate-icon.sh"
fi

ELECTRON_APP="${DESKTOP_DIR}/node_modules/electron/dist/Electron.app"

rm -rf "${APP_DIR}"
cp -R "${ELECTRON_APP}" "${APP_DIR}"

mv "${MACOS}/Electron" "${MACOS}/LOOK"

rm -f "${RESOURCES}/default_app.asar"
rm -rf "${APP_ASAR_DIR}"
mkdir -p "${APP_ASAR_DIR}"

cp "${DESKTOP_DIR}/shell/main.cjs" "${APP_ASAR_DIR}/main.cjs"
cp "${DESKTOP_DIR}/shell/package.json" "${APP_ASAR_DIR}/package.json"
cp "${DESKTOP_DIR}/shell/resolve-project-root.sh" "${RESOURCES}/resolve-project-root.sh"
chmod +x "${RESOURCES}/resolve-project-root.sh"
cp "${DESKTOP_DIR}/look-project-path.txt" "${RESOURCES}/look-project-path.txt"

/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable LOOK" "${CONTENTS}/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName LOOK" "${CONTENTS}/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleName string LOOK" "${CONTENTS}/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName LOOK" "${CONTENTS}/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string LOOK" "${CONTENTS}/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.look.local" "${CONTENTS}/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.look.local" "${CONTENTS}/Info.plist"

/usr/libexec/PlistBuddy -c "Delete :ElectronAsarIntegrity" "${CONTENTS}/Info.plist" 2>/dev/null || true

/usr/libexec/PlistBuddy -c "Delete :LSEnvironment" "${CONTENTS}/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :LSEnvironment dict" "${CONTENTS}/Info.plist"
/usr/libexec/PlistBuddy -c "Add :LSEnvironment:LOOK_PORT string 3010" "${CONTENTS}/Info.plist"
/usr/libexec/PlistBuddy -c "Add :LSEnvironment:LOOK_DESKTOP string 1" "${CONTENTS}/Info.plist"

if [[ -f "${DESKTOP_DIR}/assets/icon.icns" ]]; then
  cp "${DESKTOP_DIR}/assets/icon.icns" "${RESOURCES}/electron.icns"
  echo "==> Custom icon installed"
else
  echo "==> Default icon used. See desktop/assets/ICON.md for custom LOOK icon."
fi

echo ""
echo "✅ Built: ${APP_DIR}"
