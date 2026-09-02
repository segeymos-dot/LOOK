import { requireAdminAuthContext } from "@/lib/auth/require-auth-context";
import { getWebsiteInquiry } from "@/lib/admin/website-inquiries";
import { sendTransactionalEmail } from "@/lib/email/send";
import { LOOK_OFFICIAL_WEBSITE_URL } from "@/lib/brand/official-site";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  message: z.string().trim().min(1).max(5000),
  locale: z.enum(["ru", "en"]).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAdminAuthContext(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing id" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Enter a reply message" },
      { status: 400 }
    );
  }

  const loaded = await getWebsiteInquiry(auth.supabase, id);
  if (loaded.error || !loaded.inquiry) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }

  const inquiry = loaded.inquiry;
  if (!inquiry.email) {
    return NextResponse.json(
      { success: false, error: "Inquiry has no email" },
      { status: 400 }
    );
  }

  const locale =
    parsed.data.locale ||
    (inquiry.locale === "en" ? "en" : "ru");
  const subjectBase = inquiry.subject?.trim() || "LOOK";
  const emailSubject =
    locale === "en"
      ? `LOOK reply: ${subjectBase}`
      : `Ответ LOOK: ${subjectBase}`;

  const greetingName = inquiry.name?.trim() || (locale === "en" ? "there" : "");
  const hello =
    locale === "en"
      ? `Hello${greetingName ? `, ${greetingName}` : ""}.`
      : `Здравствуйте${greetingName ? `, ${greetingName}` : ""}.`;

  const siteHost = LOOK_OFFICIAL_WEBSITE_URL.replace(/^https?:\/\//, "");
  const text = [
    hello,
    "",
    parsed.data.message.trim(),
    "",
    "—",
    "LOOK",
    siteHost,
  ].join("\n");

  const sent = await sendTransactionalEmail({
    to: inquiry.email,
    subject: emailSubject,
    text,
  });

  if (!sent.ok) {
    return NextResponse.json(
      { success: false, error: sent.error },
      { status: 502 }
    );
  }

  const { error: replyError } = await auth.supabase
    .from("website_inquiry_replies")
    .insert({
      inquiry_id: id,
      admin_user_id: auth.user.id,
      message: parsed.data.message.trim(),
      locale,
      email_message_id: sent.messageId,
    });

  if (replyError) {
    return NextResponse.json(
      { success: false, error: replyError.message },
      { status: 500 }
    );
  }

  const { data: updated, error: updError } = await auth.supabase
    .from("website_inquiries")
    .update({
      answered_at: new Date().toISOString(),
      status: "answered",
      read_by_admin_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(
      "id, name, email, subject, message, created_at, status, read_by_admin_at, answered_at, source, locale, intent"
    )
    .single();

  if (updError) {
    return NextResponse.json(
      { success: false, error: updError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    inquiry: updated,
    email_delivered: true,
  });
}
