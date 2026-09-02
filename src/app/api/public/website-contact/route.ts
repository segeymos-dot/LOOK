import { createWebsiteInquiry } from "@/lib/admin/website-inquiries";
import {
  clientIpFromRequest,
  rateLimitAllow,
} from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = new Set([
  "https://lookappworld.com",
  "https://www.lookappworld.com",
  "https://look-app-world-site.vercel.app",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.lookappworld.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-look-contact-secret, x-idempotency-key",
    "Cache-Control": "no-store",
  };
}

function authorizedIngest(request: Request): boolean {
  // Trusted server-to-server marker from lookappworld /api/contact (never from browser form).
  if (request.headers.get("x-look-contact-source") === "lookappworld-site") {
    return true;
  }

  const expected = process.env.WEBSITE_CONTACT_SECRET?.trim();
  if (expected) {
    const got = request.headers.get("x-look-contact-secret")?.trim();
    return Boolean(got && got === expected);
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer") || "";
  if (origin && ALLOWED_ORIGINS.has(origin)) return true;
  if ([...ALLOWED_ORIGINS].some((o) => referer.startsWith(o))) return true;
  return false;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

/**
 * Public CREATE-only ingest for lookappworld.com contact form.
 * Never exposes inquiries. Uses service-role on the server only.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (!authorizedIngest(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  const ip = clientIpFromRequest(request);
  if (!rateLimitAllow(`website-contact:${ip}`, 8, 60_000)) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400, headers }
    );
  }

  // Honeypot — bots fill hidden fields; humans leave empty.
  const honeypot = String(body.company ?? body.website ?? body.fax ?? "").trim();
  if (honeypot) {
    return NextResponse.json({ success: true }, { headers });
  }

  const result = await createWebsiteInquiry({
    name: String(body.name ?? ""),
    email: String(body.email ?? ""),
    subject: String(body.subject ?? ""),
    message: String(body.message ?? ""),
    intent: body.intent != null ? String(body.intent) : null,
    locale: body.locale != null ? String(body.locale) : null,
    source: "website_contact",
  });

  if ("error" in result) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status, headers }
    );
  }

  // Do not return internal id to public callers.
  return NextResponse.json({ success: true }, { headers });
}
