import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reviewSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { provider_id, request_id, rating, comment } = parsed.data;

  const { data: req } = await supabase
    .from("requests")
    .select("id, customer_id, status")
    .eq("id", request_id)
    .single();

  if (!req || req.customer_id !== user.id || req.status !== "completed") {
    return NextResponse.json(
      { success: false, error: "Отзыв можно оставить только после завершения заказа" },
      { status: 403 }
    );
  }

  const { data: acceptedOffer } = await supabase
    .from("offers")
    .select("id")
    .eq("request_id", request_id)
    .eq("provider_id", provider_id)
    .eq("status", "accepted")
    .maybeSingle();

  if (!acceptedOffer) {
    return NextResponse.json(
      { success: false, error: "Исполнитель не выполнял этот заказ" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      provider_id,
      reviewer_id: user.id,
      request_id,
      rating,
      comment,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { success: false, error: "Вы уже оставили отзыв по этому заказу" },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, review: data });
}
