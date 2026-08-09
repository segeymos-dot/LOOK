#!/bin/bash
# Verify .env.staging.local without printing secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$ROOT/.env.staging.local"

if [[ ! -f "$ENV" ]]; then
  echo "MISSING: .env.staging.local does not exist yet."
  echo "NEXT: In Terminal.app run:"
  echo "  cd /Users/sergei/Documents/LOOK && ./scripts/setup-staging-env.sh"
  exit 1
fi

# shellcheck disable=SC1090
set -a
# Read only the keys we need via grep/cut — avoid sourcing if values have special chars
get() { grep -E "^$1=" "$ENV" | head -1 | cut -d= -f2-; }
URL="$(get NEXT_PUBLIC_SUPABASE_URL)"
ANON="$(get NEXT_PUBLIC_SUPABASE_ANON_KEY)"
SERVICE="$(get SUPABASE_SERVICE_ROLE_KEY)"
PROJECT_ID="$(get SUPABASE_PROJECT_ID)"
set +a

ok=1
[[ -n "$URL" && -n "$ANON" && -n "$SERVICE" && -n "$PROJECT_ID" ]] || { echo "FAIL: missing field(s)"; ok=0; }

HOST="$(printf '%s' "$URL" | sed -E 's|https://([^/]+)/?|\1|')"
REF="${HOST%%.supabase.co}"
if [[ "$REF" == "$PROJECT_ID" ]]; then
  echo "OK: URL ref matches Project ID"
else
  echo "FAIL: URL ref does not match Project ID"
  ok=0
fi

if [[ -f "$ROOT/.env.local" ]]; then
  LOCAL_URL="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ROOT/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  LOCAL_HOST="$(printf '%s' "$LOCAL_URL" | sed -E 's|https://([^/]+)/?|\1|')"
  if [[ "$LOCAL_HOST" == "$HOST" ]]; then
    echo "FAIL: staging URL equals .env.local URL"
    ok=0
  else
    echo "OK: staging URL differs from .env.local"
  fi
fi

if [[ "$ANON" == "$SERVICE" ]]; then
  echo "FAIL: anon and service_role are identical"
  ok=0
else
  echo "OK: anon and service_role differ"
fi

echo "OK: gitignore → $(cd "$ROOT" && git check-ignore -v .env.staging.local | awk '{print $1}')"
echo "OK: keys present (lengths only): anon=${#ANON} service=${#SERVICE}"

if [[ "$ANON" == sb_publishable_* ]]; then
  echo "OK: anon looks like publishable key"
elif [[ "$ANON" == eyJ* ]]; then
  if [[ ${#ANON} -gt 300 ]]; then
    echo "FAIL: anon JWT length ${#ANON} looks corrupted (expected ~200 or use sb_publishable_…)"
    ok=0
  else
    echo "OK: anon looks like legacy JWT"
  fi
else
  echo "FAIL: anon key format unknown (want sb_publishable_… or eyJ…)"
  ok=0
fi

if [[ "$ok" -eq 1 ]]; then
  echo "VERIFY_PASS"
  exit 0
fi
echo "VERIFY_FAIL"
exit 1
