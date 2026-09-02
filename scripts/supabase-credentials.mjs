import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vercelBin = resolve(root, "node_modules", ".bin", "vercel");

function readTokenFile(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  return value || null;
}

export function loadSupabaseAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  for (const path of [
    join(homedir(), ".config", "supabase", "access-token"),
    join(homedir(), ".supabase", "access-token"),
  ]) {
    const token = readTokenFile(path);
    if (token) return token;
  }
  return null;
}

export function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

export function mergeEnv() {
  const local = loadEnvLocal();
  return { ...local, ...process.env };
}

export function projectRefFromUrl(supabaseUrl) {
  return new URL(supabaseUrl).hostname.split(".")[0];
}

export async function fetchProjectApiKeys(token, projectRef) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`api-keys ${res.status}: ${body.slice(0, 200)}`);
  }
  return JSON.parse(body);
}

export function pickServiceRoleKey(keys) {
  const list = Array.isArray(keys) ? keys : keys?.data ?? [];

  const decodeJwtRole = (key) => {
    if (!String(key).startsWith("eyJ")) return null;
    try {
      const payload = JSON.parse(
        Buffer.from(String(key).split(".")[1], "base64url").toString()
      );
      return String(payload.role || "");
    } catch {
      return null;
    }
  };

  // Prefer explicitly named service_role / JWT role service_role.
  for (const item of list) {
    const name = String(item.name ?? item.type ?? "").toLowerCase();
    const key = item.api_key ?? item.key;
    if (!key) continue;
    if (name === "service_role" || decodeJwtRole(key) === "service_role") {
      return key;
    }
  }

  for (const item of list) {
    const name = String(item.name ?? item.type ?? "").toLowerCase();
    const key = item.api_key ?? item.key;
    if (!key) continue;
    if (
      name === "secret" ||
      name.includes("service") ||
      String(key).startsWith("sb_secret_")
    ) {
      return key;
    }
  }
  return null;
}

export function loadVercelProductionEnv(names) {
  if (!existsSync(vercelBin)) return;
  for (const name of names) {
    if (process.env[name]) continue;
    const result = spawnSync(vercelBin, ["env", "get", name, "production"], {
      cwd: root,
      encoding: "utf8",
    });
    const value = result.stdout?.trim();
    if (value && !value.includes("Error") && !value.includes("not found")) {
      process.env[name] = value;
    }
  }
}
