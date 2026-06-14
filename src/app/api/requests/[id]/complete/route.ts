import { completeRequest } from "@/lib/data/request-actions";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accessToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: "Необходима авторизация" },
      { status: 401 }
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

  const result = await completeRequest(supabase, id);

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath("/my/requests");
  revalidatePath(`/requests/${id}`);

  return NextResponse.json(result);
}
