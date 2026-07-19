import { createClient } from "@/lib/supabase/server";
import { requestRevision } from "@/lib/data/work-actions";
import { revisionSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = revisionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const result = await requestRevision(supabase, requestId, parsed.data.feedback);

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/requests");
  revalidatePath("/my/offers");

  return NextResponse.json({ success: true, status: result.status });
}
