#!/bin/bash
# Secure LOOK Staging env collector — never echoes secrets.
# Writes .env.staging.local (gitignored via .env*.local).
#
# Run in Terminal.app (recommended):
#   cd /Users/sergei/Documents/LOOK && ./scripts/setup-staging-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.env.staging.local"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

trim() { printf '%s' "$1" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

prompt_value() {
  local step="$1"
  local label="$2"
  local value=""

  if [[ -t 0 ]] && [[ "${LOOK_STAGING_USE_OSASCRIPT:-}" != "1" ]]; then
    echo ""
    echo "[$step/4] $label"
    echo "(typing is hidden — paste then press Enter)"
    # shellcheck disable=SC2162
    read -r -s value
    echo ""
  else
    value="$(osascript <<EOF
set theValue to text returned of (display dialog "$label" with title "LOOK Staging ($step/4)" default answer "" with hidden answer buttons {"Cancel", "OK"} default button "OK" cancel button "Cancel")
return theValue
EOF
)"
  fi

  trim "$value"
}

echo "============================================"
echo " LOOK Staging — secure env setup"
echo "============================================"
echo "Values are never printed on screen after paste."
echo "File target: .env.staging.local (gitignored)"
echo ""

URL="$(prompt_value 1 "Paste LOOK Staging Project URL")"
ANON="$(prompt_value 2 "Paste LOOK Staging Publishable (anon) key")"
SERVICE="$(prompt_value 3 "Paste LOOK Staging Secret (service_role) key")"
PROJECT_ID="$(prompt_value 4 "Paste LOOK Staging Project ID")"

if [[ -z "$URL" || -z "$ANON" || -z "$SERVICE" || -z "$PROJECT_ID" ]]; then
  echo "ERROR: One or more values were empty. Nothing was written."
  exit 1
fi

if [[ ! "$URL" =~ ^https://[a-z0-9-]+\.supabase\.co/?$ ]]; then
  echo "ERROR: Project URL shape is not https://<ref>.supabase.co — nothing written."
  exit 1
fi

HOST="$(printf '%s' "$URL" | sed -E 's|https://([^/]+)/?|\1|')"
REF="${HOST%%.supabase.co}"

if [[ "$REF" != "$PROJECT_ID" ]]; then
  echo "ERROR: Project URL ref and Project ID do not match. Nothing written."
  exit 1
fi

if [[ -f "$ROOT/.env.local" ]]; then
  LOCAL_URL="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ROOT/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')"
  LOCAL_HOST="$(printf '%s' "$LOCAL_URL" | sed -E 's|https://([^/]+)/?|\1|')"
  if [[ -n "$LOCAL_HOST" && "$LOCAL_HOST" == "$HOST" ]]; then
    echo "ERROR: Staging URL matches .env.local — refusing (would reuse local/production project)."
    exit 1
  fi
fi

if [[ "$ANON" == "$SERVICE" ]]; then
  echo "ERROR: Publishable and Secret keys are identical. Nothing written."
  exit 1
fi

if [[ ${#ANON} -lt 40 || ${#SERVICE} -lt 40 ]]; then
  echo "ERROR: A key looks too short. Nothing written."
  exit 1
fi

if [[ "$ANON" != sb_publishable_* && "$ANON" != eyJ* ]]; then
  echo "ERROR: Publishable/anon key must start with sb_publishable_ or eyJ. Nothing written."
  exit 1
fi

# Corrupted paste (e.g. JWT + junk) was len≈346 and caused Invalid API key.
if [[ "$ANON" == eyJ* && ${#ANON} -gt 300 ]]; then
  echo "ERROR: anon JWT length ${#ANON} looks corrupted — paste only the publishable key (sb_publishable_…). Nothing written."
  exit 1
fi

if [[ "$ANON" == sb_publishable_* && ${#ANON} -gt 80 ]]; then
  echo "ERROR: publishable key length ${#ANON} looks wrong. Nothing written."
  exit 1
fi

umask 077
cat > "$TMP" <<EOF
# LOOK Staging — local only. Never commit. Never use for production Vercel.
# Created by scripts/setup-staging-env.sh
NEXT_PUBLIC_SUPABASE_URL=$URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
SUPABASE_PROJECT_ID=$PROJECT_ID
EOF

mv "$TMP" "$OUT"
chmod 600 "$OUT"
trap - EXIT

IGNORED="$(cd "$ROOT" && git check-ignore -v .env.staging.local | awk '{print $1}')"
echo ""
echo "OK: Wrote .env.staging.local"
echo "OK: gitignore matched: $IGNORED"
echo "OK: URL host ref matches Project ID"
echo "OK: Staging URL differs from .env.local (when present)"
echo "OK: Owner-only file permissions"
echo ""
echo "Secrets were not printed. You can close this Terminal window."
