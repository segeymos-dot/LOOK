#!/usr/bin/env node
/**
 * Print Namecheap DNS records for lookcruise.com → Vercel.
 * Run after: vercel domains add lookcruise.com
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const vercelBin = path.join(root, "node_modules", ".bin", "vercel");
const domain = process.argv[2] || "lookcruise.com";

console.log(`DNS records for ${domain} on Namecheap (Advanced DNS):\n`);
console.log("These are Vercel's standard records. After `vercel domains add`,");
console.log("run `vercel domains inspect lookcruise.com` to confirm exact values.\n");

console.log("| Type | Host | Value       | TTL  |");
console.log("|------|------|-------------|------|");
console.log("| A    | @    | 76.76.21.21 | Auto |");
console.log("| A    | www  | 76.76.21.21 | Auto |");
console.log("");
console.log("Namecheap steps:");
console.log("1. Domain List → lookcruise.com → Manage → Advanced DNS");
console.log("2. Remove conflicting A/CNAME/URL Redirect records for @ and www");
console.log("3. Add the records above");
console.log("4. In Vercel: vercel domains add lookcruise.com && vercel domains add www.lookcruise.com");
console.log("5. Set NEXT_PUBLIC_APP_URL=https://lookcruise.com in Vercel env (production)");
console.log("6. npm run deploy:supabase-auth -- --domain lookcruise.com");
console.log("");

const inspect = spawnSync(vercelBin, ["domains", "inspect", domain], {
  cwd: root,
  encoding: "utf8",
});

if (inspect.status === 0 && inspect.stdout) {
  console.log("--- Vercel domain inspect ---");
  console.log(inspect.stdout);
} else {
  console.log("(Run after Vercel login and adding the domain for live DNS verification output.)");
}
