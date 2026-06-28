import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function loadVercelAuthToken() {
  if (process.env.VERCEL_TOKEN?.trim()) {
    return process.env.VERCEL_TOKEN.trim();
  }
  for (const path of [
    join(homedir(), ".config", "vercel", "auth.json"),
    join(homedir(), ".local", "share", "com.vercel.cli", "auth.json"),
  ]) {
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, "utf8"));
      const token = data.token ?? data.accessToken;
      if (token) return token;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function fetchVercelProjectEnv(projectId, teamId, token) {
  const params = new URLSearchParams({ decrypt: "true" });
  if (teamId) params.set("teamId", teamId);
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`vercel env ${res.status}: ${body.slice(0, 160)}`);
  }
  return JSON.parse(body);
}

export function envMapFromVercel(envs) {
  const out = {};
  for (const item of envs?.envs ?? envs ?? []) {
    if (!item?.key || item.value == null) continue;
    if (item.target && !item.target.includes("production")) continue;
    out[item.key] = item.value;
  }
  return out;
}

export async function loadVercelProductionEnvViaApi() {
  const token = loadVercelAuthToken();
  if (!token) return {};

  const teamId =
    process.env.VERCEL_TEAM_ID ||
    process.env.VERCEL_ORG_ID ||
    "team_bXO2kEsgxDo2WKVthKGOQU7y";

  let projectId = process.env.VERCEL_PROJECT_ID || "prj_sOPy4jEVfXl07iWzgWmGc8t9Lgea";

  try {
    const envs = await fetchVercelProjectEnv(projectId, teamId, token);
    return envMapFromVercel(envs);
  } catch {
    return {};
  }
}
