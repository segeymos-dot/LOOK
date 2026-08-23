#!/usr/bin/env node
/**
 * Save LOOK Staging Session pooler URI into .env.staging.local.
 * Does not apply migrations. Never prints secrets or URIs.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingEnvPath = resolve(root, ".env.staging.local");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
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

function projectRefFromSupabaseUrl(url) {
  return new URL(url).hostname.split(".")[0];
}

function redact(msg) {
  return String(msg)
    .replace(/postgres(?:ql)?:\/\/[^\s)'"]+/gi, "[redacted-db-url]")
    .replace(/db\.[a-z0-9-]+\.supabase\.co/gi, "db.[redacted].supabase.co")
    .replace(/postgres\.[a-z0-9-]+/gi, "postgres.[redacted]")
    .replace(/aws-0-[a-z0-9-]+\.pooler\.supabase\.com/gi, "[redacted].pooler.supabase.com");
}

function uriFingerprint(raw) {
  const n = normalizeUri(raw);
  const lower = n.toLowerCase();
  return {
    length: n.length,
    starts_postgresql:
      lower.startsWith("postgresql://") || lower.startsWith("postgres://"),
    includes_pooler: lower.includes("pooler.supabase.com"),
    includes_direct_db_host: /db\.[a-z0-9-]+\.supabase\.co/i.test(n),
    includes_project_shaped_user: /postgres\.[a-z0-9]{10,}/i.test(n),
  };
}

function capturePoolerUriFromTempFile() {
  const tmpPath = resolve(root, ".env.staging.pooler.uri.tmp");
  writeFileSync(
    tmpPath,
    "# Delete this comment. Paste the FULL Session pooler URI on the next line only.\n# Then Save (Cmd+S), close the editor, and click OK in the dialog.\n\n",
    { mode: 0o600 }
  );
  chmodSync(tmpPath, 0o600);

  spawnSync("open", ["-e", tmpPath], { encoding: "utf8" });

  const result = spawnSync(
    "osascript",
    [
      "-e",
      `display dialog "A TextEdit window opened for LOOK Staging.\\n\\n1) In Supabase → LOOK Staging → Database → Connection string\\n2) Choose Session pooler + URI\\n3) Copy the full postgresql://… string\\n4) Paste it into TextEdit on its own line (replace the comments)\\n5) Save (Cmd+S) and close TextEdit\\n6) Click OK here\\n\\nThe temp file is gitignored and will be deleted after import." with title "LOOK Staging Session pooler URI" buttons {"Cancel", "Saved — continue"} default button "Saved — continue" cancel button "Cancel"`,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw new Error("Prompt cancelled");
  }

  const raw = readFileSync(tmpPath, "utf8");
  try {
    unlinkSync(tmpPath);
  } catch {
    /* ignore */
  }

  // Prefer first non-comment, non-empty line that looks like a URI
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    return t;
  }
  return "";
}

function normalizeUri(raw) {
  let s = String(raw ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "");
  // Common dashboard copy artifact
  if (s.startsWith("psql ")) {
    s = s.slice(5).trim();
  }
  return s;
}

/** Session pooler must embed project ref (usually in username postgres.<ref>). */
function validateSessionPoolerUri(uri, ref) {
  const normalized = normalizeUri(uri);
  if (!normalized) {
    return { ok: false, reason: "URI is empty" };
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    // Password may contain unencoded @ # : — still require pooler host + ref substrings.
    const lower = normalized.toLowerCase();
    if (!lower.startsWith("postgres://") && !lower.startsWith("postgresql://")) {
      return {
        ok: false,
        reason: "URI must start with postgresql:// (Session pooler URI from Dashboard)",
      };
    }
    if (!lower.includes("pooler.supabase.com")) {
      return {
        ok: false,
        reason: "URI must include pooler.supabase.com (not direct db.* host)",
      };
    }
    if (lower.includes(`db.${ref}.supabase.co`)) {
      return { ok: false, reason: "Direct database host is not allowed" };
    }
    if (!normalized.includes(ref)) {
      return {
        ok: false,
        reason:
          "URI does not contain staging Project ID (expected in username like postgres.<project-id>)",
      };
    }
    // Accept with warning hint — pg can still fail later if password encoding is wrong
    return {
      ok: true,
      modeHint: "unparsed_but_pooler_shape_ok",
      hostKind: "pooler",
      normalized,
    };
  }

  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    return { ok: false, reason: "URI must use postgresql:// scheme" };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.includes("pooler.supabase.com")) {
    return {
      ok: false,
      reason:
        "URI host must be a Supabase pooler (*.pooler.supabase.com), not direct db.* host",
    };
  }
  if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
    return { ok: false, reason: "Direct database host is not allowed" };
  }

  const hay = `${parsed.username} ${parsed.hostname} ${normalized}`;
  if (!hay.includes(ref)) {
    return {
      ok: false,
      reason:
        "URI does not contain staging Project ID (expected in username like postgres.<project-id>)",
    };
  }

  const port = parsed.port || "";
  const modeHint =
    port === "6543"
      ? "port_6543"
      : port === "5432" || !port
        ? "session_port_5432"
        : `port_${port}`;

  return { ok: true, modeHint, hostKind: "pooler", normalized };
}

function writeEnvPreservingOthers(poolerUri) {
  const raw = existsSync(stagingEnvPath)
    ? readFileSync(stagingEnvPath, "utf8")
    : "";
  const kept = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (
      t.startsWith("SUPABASE_DB_URL=") ||
      t.startsWith("DATABASE_URL=") ||
      t.includes("constructed from Project ID") ||
      t.includes("Staging Postgres URI") ||
      t.includes("Session pooler URI")
    ) {
      continue;
    }
    kept.push(line);
  }
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  kept.push("");
  kept.push("# LOOK Staging Session pooler URI (migrations). Never commit.");
  kept.push(`SUPABASE_DB_URL=${poolerUri}`);
  kept.push("");
  writeFileSync(stagingEnvPath, kept.join("\n"), { mode: 0o600 });
  chmodSync(stagingEnvPath, 0o600);
}

function main() {
  console.log("LOOK Staging — save Session pooler URI only (no migrations)");

  if (!existsSync(stagingEnvPath)) {
    throw new Error("Missing .env.staging.local — run setup-staging-env.sh first");
  }

  const env = loadEnvFile(stagingEnvPath);
  const apiUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const projectId = env.SUPABASE_PROJECT_ID?.trim();
  if (!apiUrl || !projectId) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_PROJECT_ID");
  }
  const ref = projectRefFromSupabaseUrl(apiUrl);
  if (ref !== projectId) {
    throw new Error("API URL ref does not match SUPABASE_PROJECT_ID");
  }

  const local = loadEnvFile(resolve(root, ".env.local"));
  if (local.NEXT_PUBLIC_SUPABASE_URL?.trim() === apiUrl) {
    throw new Error("Staging API URL equals .env.local — aborting");
  }

  console.log("OK: staging API URL ref matches Project ID");
  console.log("OK: differs from .env.local");

  let check = null;
  let normalized = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(
      `Waiting for Session pooler URI via secure temp file (attempt ${attempt}/3)…`
    );
    const uri = capturePoolerUriFromTempFile();
    const fp = uriFingerprint(uri);
    check = validateSessionPoolerUri(uri, ref);
    if (check.ok) {
      normalized = check.normalized;
      break;
    }
    console.error("Rejected URI (non-secret):", JSON.stringify(fp));
    console.error("Reason:", check.reason);
    if (attempt === 3) {
      throw new Error(check.reason);
    }
    console.log("Try again with the full Session pooler postgresql:// URI.");
  }

  writeEnvPreservingOthers(normalized);

  // Re-read and confirm without printing URI
  const saved = loadEnvFile(stagingEnvPath);
  const savedUrl = (saved.SUPABASE_DB_URL || "").trim();
  const recheck = validateSessionPoolerUri(savedUrl, ref);
  if (!recheck.ok) {
    throw new Error("Save verification failed: " + recheck.reason);
  }

  console.log("");
  console.log("VERIFICATION SUMMARY (non-secret)");
  console.log("- target: LOOK Staging (.env.staging.local only)");
  console.log("- project_id_match: yes");
  console.log("- differs_from_env_local: yes");
  console.log("- uri_scheme: postgresql");
  console.log("- uri_host_kind: pooler (not direct db.*)");
  console.log("- uri_contains_project_id: yes");
  console.log("- uri_mode_hint:", check.modeHint);
  console.log("- saved_key: SUPABASE_DB_URL");
  console.log("- replaced_direct_db_url_if_any: yes");
  console.log("- file_ignored: .env*.local");
  console.log("- migrations_applied: no");
  console.log("- secrets_printed: no");
}

try {
  main();
} catch (e) {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
}
