#!/bin/bash
# Resolve LOOK repository root. Prints absolute path on stdout, exits 1 if not found.

set -euo pipefail

is_look_project() {
  local dir="$1"
  [[ -f "${dir}/package.json" ]] \
    && [[ -d "${dir}/src" ]] \
    && grep -q '"name"[[:space:]]*:[[:space:]]*"look"' "${dir}/package.json" 2>/dev/null
}

remember_path() {
  local dir="$1"
  local config_dir="${HOME}/Library/Application Support/LOOK"
  mkdir -p "${config_dir}"
  printf '%s\n' "${dir}" > "${config_dir}/project-root.txt"
  printf '%s\n' "${dir}"
}

try_path() {
  local dir="$1"
  if is_look_project "${dir}"; then
    remember_path "${dir}"
    return 0
  fi
  return 1
}

# 1. Cached path from previous successful launch
cache_file="${HOME}/Library/Application Support/LOOK/project-root.txt"
if [[ -f "${cache_file}" ]]; then
  cached="$(tr -d '\r\n' < "${cache_file}")"
  if try_path "${cached}" >/dev/null 2>&1; then
    printf '%s\n' "${cached}"
    exit 0
  fi
fi

# 2. Path baked into .app at build time
if [[ "${1:-}" != "" && -f "${1}" ]]; then
  baked="$(tr -d '\r\n' < "${1}")"
  if try_path "${baked}" >/dev/null 2>&1; then
    printf '%s\n' "${baked}"
    exit 0
  fi
fi

# 3. Common local locations
for candidate in \
  "${HOME}/Documents/LOOK" \
  "${HOME}/Developer/LOOK" \
  "${HOME}/Projects/LOOK" \
  "${HOME}/LOOK" \
  "${HOME}/Desktop/LOOK"; do
  if try_path "${candidate}" >/dev/null 2>&1; then
    printf '%s\n' "${candidate}"
    exit 0
  fi
done

# 4. Any LOOK folder directly under Documents
if [[ -d "${HOME}/Documents" ]]; then
  for candidate in "${HOME}/Documents/"*/; do
    [[ "$(basename "${candidate}")" == "LOOK" ]] || continue
    dir="${candidate%/}"
    if try_path "${dir}" >/dev/null 2>&1; then
      printf '%s\n' "${dir}"
      exit 0
    fi
  done
fi

exit 1
