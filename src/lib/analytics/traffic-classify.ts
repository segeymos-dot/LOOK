/**
 * Server-side traffic classification for visit/country analytics.
 * Never uses country/geo as a bot signal.
 */

export type TrafficType =
  | "human"
  | "bot"
  | "automation"
  | "monitor"
  | "technical_test"
  | "unknown";

export type TrafficClassification = {
  trafficType: TrafficType;
  reason: string;
};

/** Known smoke/E2E visitor id prefixes used in production probes. */
const TEST_VISITOR_PREFIX =
  /^(guest_geo_|upgrade_geo_|reg_sql_|tatiana_geo_|protect_|admin_geo_|guest_then_reg_|e2e_|pw_|playwright_)/i;

const BOT_UA =
  /\b(bot|crawler|spider|slurp|facebookexternalhit|twitterbot|slackbot|telegrambot|discordbot|googlebot|bingbot|yandexbot|applebot|baiduspider|duckduckbot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider)\b/i;

const AUTOMATION_UA =
  /\b(headless|headlesschrome|playwright|puppeteer|selenium|phantomjs|cypress|webdriver)\b/i;

const MONITOR_UA =
  /\b(uptime|monitor|healthcheck|health-check|pingdom|datadog|newrelic|statuscake|site24x7|betteruptime|vercel-screenshot|vercel-favicon|preview)\b/i;

const TOOL_UA = /\b(curl\/|wget\/|axios\/|node-fetch|undici|python-requests|go-http-client|httpie|postman|insomnia|java\/)\b/i;

const NODE_UA = /^(node|undici)(\/|$)/i;

/** Paths that must never create marketing visit sessions (defense in depth). */
export function isNonPageAnalyticsPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return (
    p.startsWith("/api/") ||
    p.startsWith("/_next/") ||
    p.startsWith("/favicon") ||
    p === "/robots.txt" ||
    p.startsWith("/sitemap") ||
    p.startsWith("/manifest") ||
    p.startsWith("/health") ||
    p.startsWith("/status") ||
    p.startsWith("/monitor") ||
    /\.(ico|png|jpe?g|gif|webp|svg|css|js|map|woff2?|ttf|txt|xml|json)$/i.test(p)
  );
}

export function isTestVisitorId(visitorId: string | null | undefined): boolean {
  const id = String(visitorId ?? "").trim();
  if (!id) return false;
  return TEST_VISITOR_PREFIX.test(id);
}

/**
 * Classify request traffic for analytics.
 * Result: human | bot | automation | monitor | technical_test | unknown
 */
export function classifyTraffic(
  request: Request,
  options?: { visitorId?: string | null; pathname?: string | null }
): TrafficClassification {
  const visitorId = options?.visitorId ?? null;
  if (isTestVisitorId(visitorId)) {
    return { trafficType: "technical_test", reason: "test_visitor_id" };
  }

  const headers = request.headers;
  const lookTest =
    headers.get("x-look-traffic") ||
    headers.get("x-look-test") ||
    headers.get("x-playwright-test");
  if (lookTest) {
    const v = lookTest.trim().toLowerCase();
    if (v === "technical_test" || v === "test" || v === "e2e" || v === "1") {
      return { trafficType: "technical_test", reason: "x-look-test-header" };
    }
    if (v === "automation" || v === "bot" || v === "monitor") {
      return { trafficType: v as TrafficType, reason: "x-look-traffic-header" };
    }
  }

  const ua = headers.get("user-agent")?.trim() ?? "";
  if (!ua) {
    return { trafficType: "unknown", reason: "missing_ua" };
  }

  if (BOT_UA.test(ua)) {
    return { trafficType: "bot", reason: "ua_bot" };
  }
  if (AUTOMATION_UA.test(ua)) {
    return { trafficType: "automation", reason: "ua_automation" };
  }
  if (MONITOR_UA.test(ua)) {
    return { trafficType: "monitor", reason: "ua_monitor" };
  }
  if (TOOL_UA.test(ua) || NODE_UA.test(ua)) {
    return { trafficType: "automation", reason: "ua_http_tool" };
  }

  // Headless Chromium often advertises HeadlessChrome in UA.
  if (/HeadlessChrome/i.test(ua)) {
    return { trafficType: "automation", reason: "ua_headless_chrome" };
  }

  // Typical browser UA → human (not country-based).
  if (
    /\b(Mozilla\/|Chrome\/|Safari\/|Firefox\/|Edg\/|OPR\/|CriOS\/|FxiOS\/|Mobile\/)/i.test(
      ua
    )
  ) {
    return { trafficType: "human", reason: "ua_browser" };
  }

  return { trafficType: "unknown", reason: "ua_unclassified" };
}

/** Marketing country analytics eligibility. */
export function isMarketingEligibleTraffic(trafficType: TrafficType): boolean {
  return trafficType === "human" || trafficType === "unknown";
}
