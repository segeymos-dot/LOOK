#!/usr/bin/env node
/**
 * Regenerates src/lib/legal/third-party-notices.json from package.json
 * production dependencies (direct only). Run after dependency changes:
 *   node scripts/generate-third-party-notices.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const deps = Object.keys(pkg.dependencies || {});
const packages = [];

for (const name of deps) {
  const dir = join(root, "node_modules", name);
  const metaPath = join(dir, "package.json");
  if (!existsSync(metaPath)) {
    packages.push({
      name,
      version: pkg.dependencies[name],
      license: "UNKNOWN",
      homepage: null,
      repository: null,
      licenseFile: null,
      licenseText: "",
      missing: true,
    });
    continue;
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  let licenseText = "";
  let licenseFile = null;
  for (const f of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "NOTICE", "NOTICE.md"]) {
    const p = join(dir, f);
    if (existsSync(p)) {
      licenseFile = f;
      licenseText = readFileSync(p, "utf8").slice(0, 12000);
      break;
    }
  }
  packages.push({
    name,
    version: meta.version,
    license: typeof meta.license === "string" ? meta.license : JSON.stringify(meta.license),
    homepage: meta.homepage || null,
    repository:
      typeof meta.repository === "string"
        ? meta.repository
        : meta.repository?.url || null,
    licenseFile,
    licenseText,
  });
}

const out = {
  generatedAt: new Date().toISOString(),
  scope: "direct-production-dependencies",
  note: "Generated from package.json dependencies. Re-run after dependency changes.",
  packages,
};

const outDir = join(root, "src/lib/legal");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "third-party-notices.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${packages.length} packages to src/lib/legal/third-party-notices.json`);
