/**
 * Platform-admin voice intents — READ / SEARCH / NAVIGATION only.
 * No destructive or write actions are defined here.
 */

export type VoiceNavIntent =
  | { type: "open_stats" }
  | { type: "open_platform" }
  | { type: "open_orders" }
  | { type: "open_orders_completed" }
  | { type: "open_orders_active" }
  | { type: "open_customers" }
  | { type: "open_providers" }
  | { type: "open_disputes" }
  | { type: "open_home" }
  | { type: "open_categories" }
  | { type: "open_chats" }
  | { type: "open_profile" }
  | { type: "open_search" }
  | { type: "open_create_order" }
  | { type: "find_customer"; q: string }
  | { type: "find_provider"; q: string }
  | { type: "find_order"; q: string }
  | { type: "unknown" };

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»""„]/g, "")
    .replace(/[.!?…,;:]+$/g, "")
    .replace(/\s+/g, " ");
}

function capture(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    const q = m?.[1]?.trim();
    if (q) return q;
  }
  return null;
}

/**
 * Parse a recognized phrase into a whitelist navigation/search intent.
 * Anything not explicitly matched → unknown (never guesses write actions).
 */
export function parseVoiceNavIntent(transcript: string): VoiceNavIntent {
  const text = normalize(transcript);
  if (!text) return { type: "unknown" };

  // --- Search / find with a name/title (before generic opens) ---
  const customerQ = capture(text, [
    /(?:найди|открой|покажи)\s+заказчик[аеу]?\s+(.+)/i,
    /(?:найди|открой|покажи)\s+клиент[аеу]?\s+(.+)/i,
    /(?:find|open|show)\s+customer\s+(.+)/i,
  ]);
  if (customerQ) return { type: "find_customer", q: customerQ };

  const providerQ = capture(text, [
    /(?:найди|открой|покажи)\s+исполнител[ьяю]\s+(.+)/i,
    /(?:найди|открой|покажи)\s+специалист[аеу]?\s+(.+)/i,
    /(?:find|open|show)\s+provider\s+(.+)/i,
  ]);
  if (providerQ) return { type: "find_provider", q: providerQ };

  const orderQ = capture(text, [
    /(?:найди|открой|покажи)\s+заказ\s+(.+)/i,
    /(?:find|open|show)\s+order\s+(.+)/i,
  ]);
  if (orderQ) {
    if (!/^(ы|ов|ы все|all)$/i.test(orderQ)) {
      return { type: "find_order", q: orderQ };
    }
  }

  // --- Create order (before bare "заказ") ---
  if (
    /созда(ть|й)\s+(новый\s+)?заказ|новый\s+заказ|create\s+(a\s+)?(new\s+)?order|new\s+order/i.test(
      text
    )
  ) {
    return { type: "open_create_order" };
  }

  // --- Filtered order lists ---
  if (
    /завершенн\S*\s+заказ|заказ\S*\s+завершен|completed\s+orders|orders\s+completed/i.test(
      text
    )
  ) {
    return { type: "open_orders_completed" };
  }
  if (
    /активн\S*\s+заказ|заказ\S*\s+актив|active\s+orders|orders\s+active/i.test(text)
  ) {
    return { type: "open_orders_active" };
  }

  // --- Home ---
  if (
    /^(главная|домой|на главную|открой главную|home|go home|open home)$/i.test(text) ||
    /на главную|открой главную|go home|open (the )?home/i.test(text)
  ) {
    return { type: "open_home" };
  }

  // --- Categories (home category grid — no dedicated /categories route) ---
  if (/категори|categories/i.test(text)) {
    return { type: "open_categories" };
  }

  // --- Chats ---
  if (/чат|сообщен|messages?|chats?/i.test(text)) {
    return { type: "open_chats" };
  }

  // --- Profile ---
  if (/профиль|profile/i.test(text)) {
    return { type: "open_profile" };
  }

  // --- Search (incl. bare "найди исполнителя" without a name) ---
  if (
    /^(поиск|найти|найди исполнителя|открой поиск|find|search|open search)$/i.test(
      text
    ) ||
    /открой поиск|open search|найди исполнителя\s*$|find (a )?provider\s*$/i.test(
      text
    )
  ) {
    return { type: "open_search" };
  }

  // --- Admin sections ---
  if (/статистик|statistics|\bstats\b/i.test(text)) {
    return { type: "open_stats" };
  }
  if (/платформ|platform/i.test(text)) {
    return { type: "open_platform" };
  }
  if (/спор|dispute/i.test(text)) {
    return { type: "open_disputes" };
  }
  if (
    (/заказчик|клиент|customers?/i.test(text) ||
      /открой клиент|покажи клиент/i.test(text)) &&
    !/исполнител|специалист|provider/i.test(text)
  ) {
    return { type: "open_customers" };
  }
  if (/исполнител|специалист|providers?/i.test(text)) {
    return { type: "open_providers" };
  }
  if (/заказ|orders?/i.test(text)) {
    return { type: "open_orders" };
  }

  return { type: "unknown" };
}
