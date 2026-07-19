import { submitWork } from "@/lib/data/work-actions";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { PAYMENT_REQUIRED_CODE } from "@/lib/payments/work-submission-guard";
import { workSubmitSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: "Необходима авторизация" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = workSubmitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const supabase = createAuthenticatedClient(accessToken);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Необходима авторизация" },
      { status: 401 }
    );
  }

  const result = await submitWork(
    supabase,
    requestId,
    parsed.data.summary,
    parsed.data.attachments ?? []
  );

  if (!result.success) {
    const status = result.code === PAYMENT_REQUIRED_CODE ? 403 : 400;
    return NextResponse.json(
      { success: false, error: result.error, code: result.code },
      { status }
    );
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/requests");
  revalidatePath("/my/offers");

  return NextResponse.json({ success: true, status: result.status });
}
