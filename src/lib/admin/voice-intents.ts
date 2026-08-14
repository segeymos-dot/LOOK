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
  | { type: "find_customer"; q: string }
  | { type: "find_provider"; q: string }
  | { type: "find_order"; q: string }
  | { type: "unknown" };

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[«»""„]/g, "")
    .replace(/[.!?…,;:]+$/g, "")
    .replace(/\s+/g, " ");
}

function capture(
  text: string,
  patterns: RegExp[]
): string | null {
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

  // --- Search / find (must run before generic "orders/customers" opens) ---
  const customerQ = capture(text, [
    /(?:найди|открой|покажи)\s+заказчик[аеу]?\s+(.+)/i,
    /(?:найди|открой|покажи)\s+клиент[аеу]?\s+(.+)/i,
    /(?:find|open|show)\s+customer\s+(.+)/i,
  ]);
  if (customerQ) return { type: "find_customer", q: customerQ };

  const providerQ = capture(text, [
    /(?:найди|открой|покажи)\s+исполнител[ьяю]\s+(.+)/i,
    /(?:find|open|show)\s+provider\s+(.+)/i,
  ]);
  if (providerQ) return { type: "find_provider", q: providerQ };

  const orderQ = capture(text, [
    // Singular "заказ" + query (not "заказы")
    /(?:найди|открой|покажи)\s+заказ\s+(.+)/i,
    /(?:find|open|show)\s+order\s+(.+)/i,
  ]);
  if (orderQ) {
    // Avoid treating bare list cues as a title
    if (!/^(ы|ов|ы все|all)$/i.test(orderQ)) {
      return { type: "find_order", q: orderQ };
    }
  }

  // --- Filtered order lists ---
  if (
    /заверш[её]нн\S*\s+заказ|заказ\S*\s+заверш|completed\s+orders|orders\s+completed/i.test(
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

  // --- Section opens ---
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
    /заказчик|клиент|customers?/i.test(text) &&
    !/исполнител|provider/i.test(text)
  ) {
    return { type: "open_customers" };
  }
  if (/исполнител|providers?/i.test(text)) {
    return { type: "open_providers" };
  }
  if (/заказ|orders?/i.test(text)) {
    return { type: "open_orders" };
  }

  return { type: "unknown" };
}
