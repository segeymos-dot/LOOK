#!/usr/bin/env node
/**
 * Production readiness preflight (no Stripe keys required, no payment code changes).
 * Checks scripts, localhost leakage in runtime sources, env template, and build artifacts.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function pass(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg, detail = "") {
  console.error(`❌ ${msg}${detail ? `\n   ${detail}` : ""}`);
  failed++;
}
function warn(msg) {
  console.warn(`⚠️  ${msg}`);
}

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === "dist" ||
      name === ".git" ||
      name === "LOOK.app"
    ) {
      continue;
    }
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function main() {
  console.log("LOOK production preflight\n");

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const requiredScripts = [
    "build",
    "start",
    "typecheck",
    "desktop",
    "desktop:build",
    "desktop:install",
    "deploy",
    "deploy:domain",
    "deploy:supabase-auth",
    "preflight:production",
    "test:stripe-config",
    "supabase:apply-pending",
  ];
  for (const s of requiredScripts) {
    if (pkg.scripts?.[s]) pass(`npm script "${s}"`);
    else fail(`Missing npm script "${s}"`);
  }

  if (!existsSync(join(root, ".env.example"))) fail(".env.example missing");
  else pass(".env.example present");

  const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
  if (gitignore.includes("!.env.example") || !gitignore.split("\n").includes(".env*")) {
    pass(".gitignore keeps .env.example trackable");
  } else {
    fail(".gitignore may ignore .env.example via .env*");
  }

  const runtimeDirs = [join(root, "src"), join(root, "desktop", "shell")];
  const localhostHits = [];
  for (const dir of runtimeDirs) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      if (!/\.(ts|tsx|js|cjs|mjs)$/.test(file)) continue;
      // Intentional local/desktop defaults — not production web URLs.
      if (file.endsWith("app-url.ts")) continue;
      if (file.endsWith("email-confirmation.ts")) continue;
      if (file.endsWith("main.cjs")) continue;
      const text = readFileSync(file, "utf8");
      if (/localhost:3000|localhost:3010/.test(text)) {
        localhostHits.push(relative(root, file));
      }
    }
  }
  if (localhostHits.length === 0) {
    pass("No hardcoded localhost:3000/3010 in runtime src (excl. intentional helpers)");
  } else {
    fail("Hardcoded localhost in runtime sources", localhostHits.join(", "));
  }

  const appUrl = readFileSync(join(root, "src/lib/app-url.ts"), "utf8");
  if (
    appUrl.includes("PRODUCTION_AUTH_ORIGIN") &&
    appUrl.includes("isDesktopShellRuntime") &&
    appUrl.includes("lookcruise.com")
  ) {
    pass("app-url.ts pins production to lookcruise.com (desktop shell exception)");
  } else {
    fail("app-url.ts production guards look incomplete");
  }

  const envLocal = loadEnvLocal();
  const appLocal = envLocal.NEXT_PUBLIC_APP_URL?.trim();
  if (!appLocal) {
    warn(".env.local NEXT_PUBLIC_APP_URL unset (OK for local; set https://lookcruise.com on Vercel)");
  } else if (/localhost|127\.0\.0\.1|:3010/.test(appLocal)) {
    warn(
      `.env.local NEXT_PUBLIC_APP_URL is local (${appLocal}) — do not copy this value to Vercel production`
    );
  } else {
    pass(`Local NEXT_PUBLIC_APP_URL looks public: ${appLocal}`);
  }

  for (const key of [
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (envLocal[key]?.trim()) pass(`${key} present in .env.local`);
    else warn(`${key} not set yet (expected until Stripe/go-live)`);
  }

  if (existsSync(join(root, "desktop/scripts/build-mac-app.sh"))) {
    pass("Electron build script present");
  } else {
    fail("desktop/scripts/build-mac-app.sh missing");
  }

  if (process.env.SKIP_TYPECHECK === "1") {
    warn("Skipped typecheck (SKIP_TYPECHECK=1)");
  } else {
    console.log("\n==> Running typecheck...");
    const tc = spawnSync("npm", ["run", "typecheck"], {
      cwd: root,
      encoding: "utf8",
      shell: true,
    });
    if (tc.status === 0) pass("typecheck");
    else fail("typecheck", (tc.stdout || tc.stderr || "").slice(-400));
  }

  if (process.env.SKIP_BUILD === "1") {
    if (existsSync(join(root, ".next/BUILD_ID"))) pass("Existing .next/BUILD_ID (SKIP_BUILD=1)");
    else fail("No .next/BUILD_ID — run npm run build");
  } else {
    console.log("\n==> Running next build...");
    const build = spawnSync("npm", ["run", "build"], {
      cwd: root,
      encoding: "utf8",
      shell: true,
      env: {
        ...process.env,
        // Avoid baking a mistaken local URL into a production-shaped build artifact here.
        NEXT_PUBLIC_APP_URL:
          envLocal.NEXT_PUBLIC_APP_URL &&
          !/localhost|127\.0\.0\.1|:3010/.test(envLocal.NEXT_PUBLIC_APP_URL)
            ? envLocal.NEXT_PUBLIC_APP_URL
            : "https://lookcruise.com",
      },
    });
    if (build.status === 0 && existsSync(join(root, ".next/BUILD_ID"))) {
      pass("next build (.next/BUILD_ID present)");
    } else {
      fail("next build", (build.stdout || build.stderr || "").slice(-500));
    }
  }

  console.log(
    failed
      ? `\nPreflight failed: ${failed} issue(s).`
      : "\nPreflight OK — remaining go-live steps: Stripe keys, migrations, webhook, test payment, deploy."
  );
  process.exit(failed ? 1 : 0);
}

main();
