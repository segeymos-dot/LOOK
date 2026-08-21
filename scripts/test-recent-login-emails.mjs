/**
 * Smoke checks for remembered-login email helpers (no password storage).
 * Run: node scripts/test-recent-login-emails.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Load TS via experimental strip-types by spawning is heavier; duplicate pure logic checks inline.
const LOOK_RECENT_LOGIN_EMAILS_KEY = "look_recent_login_emails";
const store = new Map();

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
function isValidStoredEmail(value) {
  if (typeof value !== "string") return false;
  const email = normalizeEmail(value);
  return email.length > 2 && email.includes("@") && !email.includes(" ");
}
function readRecentLoginEmails() {
  const raw = store.get(LOOK_RECENT_LOGIN_EMAILS_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const emails = [];
  for (const item of parsed) {
    if (!isValidStoredEmail(item)) continue;
    const email = normalizeEmail(item);
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
    if (emails.length >= 5) break;
  }
  return emails;
}
function rememberLoginEmail(email) {
  const normalized = normalizeEmail(email);
  if (!isValidStoredEmail(normalized)) return;
  const existing = readRecentLoginEmails().filter((item) => item !== normalized);
  const next = [normalized, ...existing].slice(0, 5);
  store.set(LOOK_RECENT_LOGIN_EMAILS_KEY, JSON.stringify(next));
}
function filterRecentLoginEmails(query) {
  const emails = readRecentLoginEmails();
  const q = normalizeEmail(query);
  if (!q) return [];
  return emails.filter((email) => email.startsWith(q)).slice(0, 5);
}

store.clear();
assert.deepEqual(readRecentLoginEmails(), []);
rememberLoginEmail("User@Example.com");
assert.deepEqual(readRecentLoginEmails(), ["user@example.com"]);
rememberLoginEmail("other@example.com");
assert.deepEqual(readRecentLoginEmails(), ["other@example.com", "user@example.com"]);
rememberLoginEmail("user@example.com");
assert.deepEqual(readRecentLoginEmails(), ["user@example.com", "other@example.com"]);
assert.deepEqual(filterRecentLoginEmails(""), []);
assert.deepEqual(filterRecentLoginEmails("user"), ["user@example.com"]);
const raw = store.get(LOOK_RECENT_LOGIN_EMAILS_KEY) ?? "";
assert.ok(!raw.toLowerCase().includes("password"));
console.log("test-recent-login-emails: OK");
