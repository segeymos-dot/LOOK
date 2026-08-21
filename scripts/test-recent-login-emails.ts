/**
 * Smoke checks for remembered-login email helpers (no password storage).
 * Run: node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-recent-login-emails.ts
 */
import assert from "node:assert/strict";
import {
  LOOK_RECENT_LOGIN_EMAILS_KEY,
  filterRecentLoginEmails,
  rememberLoginEmail,
  readRecentLoginEmails,
} from "../src/lib/auth/recent-login-emails.ts";

const store = new Map<string, string>();

(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
  key: () => null,
  get length() {
    return store.size;
  },
};

store.clear();
assert.deepEqual(readRecentLoginEmails(), []);

rememberLoginEmail("User@Example.com");
assert.deepEqual(readRecentLoginEmails(), ["user@example.com"]);

rememberLoginEmail("other@example.com");
assert.deepEqual(readRecentLoginEmails(), [
  "other@example.com",
  "user@example.com",
]);

// Re-login moves to front without duplicating
rememberLoginEmail("user@example.com");
assert.deepEqual(readRecentLoginEmails(), [
  "user@example.com",
  "other@example.com",
]);

// Failed-login style: empty query must not dump suggestions (browser autofill owns focus)
assert.deepEqual(filterRecentLoginEmails(""), []);
assert.deepEqual(filterRecentLoginEmails("user"), ["user@example.com"]);

// Never persist passwords under this key
const raw = store.get(LOOK_RECENT_LOGIN_EMAILS_KEY) ?? "";
assert.ok(!raw.toLowerCase().includes("password"));
assert.ok(!raw.includes(":"));

console.log("test-recent-login-emails: OK");
