import { reviewSchema } from "@/lib/validations";
import { createAuthenticatedClient } from "@/lib/supabase/authenticated-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { reviewee_id, request_id, rating, comment } = parsed.data;

  const { data: req } = await supabase
    .from("requests")
    .select("id, customer_id, status")
    .eq("id", request_id)
    .single();

  if (!req) {
    return NextResponse.json(
      { success: false, error: "Заказ не найден" },
      { status: 404 }
    );
  }

  if (req.status !== "completed") {
    return NextResponse.json(
      { success: false, error: "Отзыв можно оставить только после завершения заказа" },
      { status: 403 }
    );
  }

  if (req.customer_id !== user.id) {
    return NextResponse.json(
      { success: false, error: "Отзыв может оставить только заказчик этого заказа" },
      { status: 403 }
    );
  }

  const { data: acceptedOffer } = await supabase
    .from("offers")
    .select("id, provider_id")
    .eq("request_id", request_id)
    .eq("status", "accepted")
    .maybeSingle();

  if (!acceptedOffer) {
    return NextResponse.json(
      { success: false, error: "Заказ без принятого исполнителя" },
      { status: 403 }
    );
  }

  if (reviewee_id !== acceptedOffer.provider_id) {
    return NextResponse.json(
      { success: false, error: "Отзыв можно оставить только выбранному исполнителю" },
      { status: 403 }
    );
  }

  if (reviewee_id === user.id) {
    return NextResponse.json(
      { success: false, error: "Нельзя оставить отзыв самому себе" },
      { status: 403 }
    );
  }

  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("request_id", request_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { success: false, error: "Вы уже оставили отзыв по этому заказу" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      provider_id: acceptedOffer.provider_id,
      reviewee_id: acceptedOffer.provider_id,
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
