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

  if (!req || req.status !== "completed") {
    return NextResponse.json(
      { success: false, error: "Отзыв можно оставить только после завершения заказа" },
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

  const isCustomerReview =
    req.customer_id === user.id && reviewee_id === acceptedOffer.provider_id;
  const isProviderReview =
    acceptedOffer.provider_id === user.id && reviewee_id === req.customer_id;

  if (!isCustomerReview && !isProviderReview) {
    return NextResponse.json(
      { success: false, error: "Нет прав оставить отзыв по этому заказу" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      provider_id: reviewee_id,
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
