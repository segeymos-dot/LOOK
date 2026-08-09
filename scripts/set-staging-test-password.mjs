#!/usr/bin/env node
/**
 * Set one shared test password for LOOK Staging accounts.
 * Hidden prompt only — never prints the password or service role key.
 *
 * Accounts: customer@test.look, provider@test.look, admin@test.look
 *
 * Usage (Terminal.app recommended):
 *   node scripts/set-staging-test-password.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingEnvPath = resolve(root, ".env.staging.local");
const localEnvPath = resolve(root, ".env.local");

const EMAILS = [
  "customer@test.look",
  "provider@test.look",
  "admin@test.look",
];

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

function projectRefFromUrl(url) {
  return new URL(url).hostname.split(".")[0];
}

function redact(msg) {
  return String(msg)
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted-jwt]")
    .replace(/sb_[a-z]+_[A-Za-z0-9]+/g, "[redacted-key]");
}

function assertStagingOnly(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const projectId = env.SUPABASE_PROJECT_ID?.trim();
  if (!url || !anon || !service || !projectId) {
    throw new Error("Missing keys in .env.staging.local");
  }
  if (projectRefFromUrl(url) !== projectId) {
    throw new Error("Staging URL ref does not match SUPABASE_PROJECT_ID");
  }
  const local = loadEnvFile(localEnvPath);
  if (local.NEXT_PUBLIC_SUPABASE_URL?.trim() === url) {
    throw new Error("Staging URL equals .env.local — refusing");
  }
  return { url, anon, service };
}

function promptPasswordHidden() {
  // Prefer Terminal silent readline when TTY is available.
  if (process.stdin.isTTY && process.env.LOOK_STAGING_USE_OSASCRIPT !== "1") {
    return new Promise((resolvePromise, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });
      // Mute echo
      const output = /** @type {any} */ (rl)._writeToOutput;
      /** @type {any} */ (rl)._writeToOutput = function (str) {
        if (str.includes("\n") || str.includes("\r")) {
          output.call(rl, str);
        } else {
          output.call(rl, "");
        }
      };
      console.log("");
      console.log("Enter ONE new test password for all 3 LOOK Staging accounts.");
      console.log("(input hidden — paste/type, then press Enter)");
      rl.question("> ", (answer) => {
        rl.close();
        const pwd = String(answer || "").replace(/\r/g, "");
        if (!pwd) reject(new Error("Empty password"));
        else resolvePromise(pwd);
      });
    });
  }

  const result = spawnSync(
    "osascript",
    [
      "-e",
      'set theValue to text returned of (display dialog "Enter ONE new test password for LOOK Staging accounts:\\ncustomer@test.look\\nprovider@test.look\\nadmin@test.look\\n\\nTyping is hidden. Password is not printed." with title "LOOK Staging test password" default answer "" with hidden answer buttons {"Cancel", "OK"} default button "OK" cancel button "Cancel")\nreturn theValue',
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error("Password prompt cancelled");
  const pwd = result.stdout.trim();
  if (!pwd) throw new Error("Empty password");
  return pwd;
}

async function main() {
  console.log("LOOK Staging — set shared test password");
  console.log("Target: .env.staging.local only · no Production · no push/deploy");

  if (!existsSync(stagingEnvPath)) {
    throw new Error("Missing .env.staging.local");
  }
  const { url, anon, service } = assertStagingOnly(loadEnvFile(stagingEnvPath));
  console.log("OK: staging target verified (values not printed)");

  // Phase marker for operator: stop here until password is entered.
  console.log("WAITING_FOR_PASSWORD");
  const password = await promptPasswordHidden();
  console.log("PASSWORD_RECEIVED (not displayed)");

  if (password.length < 8) {
    throw new Error("Password too short (min 8)");
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) throw new Error(`listUsers: ${listError.message}`);

  const byEmail = new Map(
    (listed?.users ?? []).map((u) => [(u.email || "").toLowerCase(), u])
  );

  const rows = [];
  for (const email of EMAILS) {
    const user = byEmail.get(email.toLowerCase());
    if (!user) {
      rows.push({ email, result: "FAIL", detail: "user not found" });
      continue;
    }
    try {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
      });
      if (error) {
        rows.push({ email, result: "FAIL", detail: redact(error.message) });
        continue;
      }

      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: anon,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.access_token) {
        rows.push({ email, result: "PASS" });
      } else {
        rows.push({
          email,
          result: "FAIL",
          detail: redact(
            body.error_description || body.msg || body.error || String(res.status)
          ),
        });
      }
    } catch (e) {
      rows.push({
        email,
        result: "FAIL",
        detail: redact(e instanceof Error ? e.message : String(e)),
      });
    }
  }

  // Drop password reference ASAP
  // eslint-disable-next-line no-param-reassign
  void password;

  console.log("");
  console.log("email | result");
  console.log("----------------------");
  for (const r of rows) {
    console.log(
      `${r.email} | ${r.result}${r.detail ? ` (${r.detail})` : ""}`
    );
  }
  const allPass = rows.every((r) => r.result === "PASS");
  console.log("");
  console.log(allPass ? "PASSWORD_UPDATE: PASS" : "PASSWORD_UPDATE: FAIL");
  console.log("Password and service role key were not printed.");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
