#!/usr/bin/env bash
# Install the LOOK development Desktop launcher.
# Backs up any existing Desktop LOOK.app to LOOK-old.app (never deletes).
#
# macOS TCC note: a Desktop .app cannot silently read ~/Documents. The .app is a
# thin trampoline that opens a .command runner under Application Support, which
# executes in Terminal (Documents access) and starts Docker/Supabase/Next/Electron.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${DESKTOP_DIR}/.." && pwd)"

TARGET="${HOME}/Desktop/LOOK.app"
BACKUP="${HOME}/Desktop/LOOK-old.app"
STAGING="${DESKTOP_DIR}/dist/LOOK-dev-launcher.app"

SUPPORT_DIR="${HOME}/Library/Application Support/LOOK"
COMMAND_RUNNER="${SUPPORT_DIR}/launch-look.command"
LAUNCHER_SCRIPT="${SCRIPT_DIR}/dev-desktop-launcher.sh"

if [[ ! -f "${LAUNCHER_SCRIPT}" ]]; then
  echo "Missing ${LAUNCHER_SCRIPT}" >&2
  exit 1
fi

chmod +x "${LAUNCHER_SCRIPT}"
mkdir -p "${SUPPORT_DIR}"

echo "==> Writing Application Support command runner"
# Runs in Terminal.app context so TCC allows ~/Documents access.
cat > "${COMMAND_RUNNER}" <<EOF
#!/bin/bash
# Hide the Terminal window used only as a TCC-safe runner.
(/usr/bin/osascript -e 'tell application "Terminal" to set visible of front window to false' >/dev/null 2>&1 &)
export PATH="/opt/homebrew/bin:/usr/local/bin:\${HOME}/.nvm/current/bin:\${HOME}/.volta/bin:/usr/bin:/bin:/usr/sbin:/sbin:\${PATH:-}"
PROJECT_ROOT=$(printf '%q' "${PROJECT_ROOT}")
LOG_DIR="\${HOME}/Library/Logs/LOOK"
mkdir -p "\${LOG_DIR}"
echo "[\$(date '+%Y-%m-%d %H:%M:%S')] command-runner start project=\${PROJECT_ROOT}" >> "\${LOG_DIR}/wrapper.log"

if [[ ! -f "\${PROJECT_ROOT}/desktop/scripts/dev-desktop-launcher.sh" ]]; then
  /usr/bin/osascript -e 'display dialog "LOOK project folder was not found. Re-run: npm run desktop:install-dev" with title "LOOK" buttons {"OK"} default button 1 with icon stop' >/dev/null 2>&1 || true
  exit 1
fi

/bin/bash "\${PROJECT_ROOT}/desktop/scripts/dev-desktop-launcher.sh"
status=\$?
exit "\${status}"
EOF
chmod +x "${COMMAND_RUNNER}"

# Remember project root for other tooling.
printf '%s\n' "${PROJECT_ROOT}" > "${SUPPORT_DIR}/project-root.txt"

echo "==> Building development Desktop launcher app"
rm -rf "${STAGING}"
mkdir -p "${STAGING}/Contents/MacOS" "${STAGING}/Contents/Resources"

ICON_SRC=""
if [[ -f "${TARGET}/Contents/Resources/AppIcon.icns" ]]; then
  ICON_SRC="${TARGET}/Contents/Resources/AppIcon.icns"
elif [[ -f "${TARGET}/Contents/Resources/electron.icns" ]]; then
  ICON_SRC="${TARGET}/Contents/Resources/electron.icns"
elif [[ -f "${BACKUP}/Contents/Resources/electron.icns" ]]; then
  ICON_SRC="${BACKUP}/Contents/Resources/electron.icns"
elif [[ -f "${DESKTOP_DIR}/assets/icon.icns" ]]; then
  ICON_SRC="${DESKTOP_DIR}/assets/icon.icns"
elif [[ -f "${DESKTOP_DIR}/dist/LOOK.app/Contents/Resources/electron.icns" ]]; then
  ICON_SRC="${DESKTOP_DIR}/dist/LOOK.app/Contents/Resources/electron.icns"
fi

if [[ -n "${ICON_SRC}" ]]; then
  cp "${ICON_SRC}" "${STAGING}/Contents/Resources/AppIcon.icns"
fi

# Thin trampoline — does not need Documents TCC rights.
cat > "${STAGING}/Contents/MacOS/LOOK" <<'WRAP'
#!/bin/bash
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin:${PATH:-}"

LOG_DIR="${HOME}/Library/Logs/LOOK"
mkdir -p "${LOG_DIR}"
WRAP_LOG="${LOG_DIR}/wrapper.log"
COMMAND_RUNNER="${HOME}/Library/Application Support/LOOK/launch-look.command"

log_wrap() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "${WRAP_LOG}"
}

log_wrap "Desktop LOOK trampoline start"
log_wrap "HOME=${HOME:-} USER=${USER:-} PWD=$(pwd)"

if [[ ! -x "${COMMAND_RUNNER}" ]]; then
  log_wrap "ERROR: missing command runner at ${COMMAND_RUNNER}"
  /usr/bin/osascript -e 'display dialog "LOOK launcher is not installed correctly. From the project folder run: npm run desktop:install-dev" with title "LOOK" buttons {"OK"} default button 1 with icon stop' >/dev/null 2>&1 || true
  exit 1
fi

log_wrap "Opening command runner via Terminal"
# Terminal.app has Documents access; the .command file runs the real launcher there.
exec /usr/bin/open "${COMMAND_RUNNER}"
WRAP
chmod +x "${STAGING}/Contents/MacOS/LOOK"

ICON_KEY=""
if [[ -f "${STAGING}/Contents/Resources/AppIcon.icns" ]]; then
  ICON_KEY="AppIcon"
fi

cat > "${STAGING}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>LOOK</string>
  <key>CFBundleExecutable</key>
  <string>LOOK</string>
  <key>CFBundleIdentifier</key>
  <string>com.look.local.devlauncher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>LOOK</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
$(if [[ -n "${ICON_KEY}" ]]; then printf '  <key>CFBundleIconFile</key>\n  <string>%s</string>\n' "${ICON_KEY}"; fi)
</dict>
</plist>
EOF

printf 'APPL????' > "${STAGING}/Contents/PkgInfo"

echo "==> Backing up existing Desktop item (if present)"
if [[ -e "${TARGET}" ]]; then
  if [[ -e "${BACKUP}" ]]; then
    SECONDARY="${HOME}/Desktop/LOOK-old-$(date +%Y%m%d-%H%M%S).app"
    echo "    LOOK-old.app already exists; moving current LOOK.app to ${SECONDARY}"
    mv "${TARGET}" "${SECONDARY}"
    echo "    Backup: ${SECONDARY}"
  else
    mv "${TARGET}" "${BACKUP}"
    echo "    Backup: ${BACKUP}"
  fi
else
  echo "    No existing LOOK.app on Desktop"
fi

echo "==> Installing development launcher to Desktop"
cp -R "${STAGING}" "${TARGET}"
xattr -cr "${TARGET}" 2>/dev/null || true
touch "${TARGET}"
/usr/bin/osascript -e 'tell application "Finder" to update POSIX file "'"${TARGET}"'"' >/dev/null 2>&1 || true

echo "✅ Installed: ${TARGET}"
echo "   Runner: ${COMMAND_RUNNER}"
echo "   Double-click LOOK on your Desktop to launch the development stack."
