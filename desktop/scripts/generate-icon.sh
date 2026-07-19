#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="$(cd "${SCRIPT_DIR}/../assets" && pwd)"
SOURCE="${ASSETS_DIR}/icon-1024.png"
ICONSET="${ASSETS_DIR}/icon.iconset"
ICNS="${ASSETS_DIR}/icon.icns"

if [[ ! -f "${SOURCE}" ]]; then
  echo "Place a 1024×1024 PNG at: ${SOURCE}" >&2
  exit 1
fi

if ! command -v sips >/dev/null 2>&1 || ! command -v iconutil >/dev/null 2>&1; then
  echo "sips and iconutil are required (macOS built-in tools)." >&2
  exit 1
fi

rm -rf "${ICONSET}"
mkdir -p "${ICONSET}"

sips -z 16 16     "${SOURCE}" --out "${ICONSET}/icon_16x16.png"      >/dev/null
sips -z 32 32     "${SOURCE}" --out "${ICONSET}/icon_16x16@2x.png"   >/dev/null
sips -z 32 32     "${SOURCE}" --out "${ICONSET}/icon_32x32.png"      >/dev/null
sips -z 64 64     "${SOURCE}" --out "${ICONSET}/icon_32x32@2x.png"   >/dev/null
sips -z 128 128   "${SOURCE}" --out "${ICONSET}/icon_128x128.png"    >/dev/null
sips -z 256 256   "${SOURCE}" --out "${ICONSET}/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "${SOURCE}" --out "${ICONSET}/icon_256x256.png"    >/dev/null
sips -z 512 512   "${SOURCE}" --out "${ICONSET}/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "${SOURCE}" --out "${ICONSET}/icon_512x512.png"    >/dev/null
cp "${SOURCE}" "${ICONSET}/icon_512x512@2x.png"

iconutil -c icns "${ICONSET}" -o "${ICNS}"

echo "✅ Created ${ICNS}"
echo "   Rebuild the app: npm run desktop:build"
