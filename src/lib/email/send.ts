/**
 * Lightweight transactional email via Resend HTTP API.
 * Requires RESEND_API_KEY (+ optional LOOK_EMAIL_FROM).
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

function fromAddress(): string {
  return (
    process.env.LOOK_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "LOOK <noreply@lookappworld.com>"
  );
}

export function isTransactionalEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendTransactionalEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "Email is not configured (RESEND_API_KEY missing)",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        error:
          body.error?.message ||
          body.message ||
          `Email provider error (${res.status})`,
      };
    }
    return { ok: true, messageId: body.id ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Email send failed",
    };
  }
}
