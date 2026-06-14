"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { getAuthenticatedUser } from "@/lib/auth/client-fetch";
import { submitOffer } from "@/lib/data/submit-offer";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { offerSchema } from "@/lib/validations";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function NewOfferPage() {
  const { id: requestId } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    price: "",
    message: "",
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = offerSchema.safeParse({
      price: Number(form.price),
      message: form.message,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      if (isDemoMode()) {
        router.push(`/requests/${requestId}`);
        return;
      }

      const user = await getAuthenticatedUser();
      if (!user) {
        router.push(`/login?redirect=/requests/${requestId}/offer`);
        return;
      }

      const supabase = createClient();
      const result = await submitOffer(supabase, user.id, {
        requestId,
        price: parsed.data.price,
        message: parsed.data.message,
      });

      if (!result.success) {
        setErrors({ form: result.error });
        return;
      }

      router.push(`/requests/${requestId}`);
      router.refresh();
    } catch {
      setErrors({ form: "Не удалось отправить отклик" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout hideNav>
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <Link href={`/requests/${requestId}`} className="text-sm text-indigo-600">
          ← Назад к заказу
        </Link>

        <h1 className="text-xl font-bold">Откликнуться на заказ</h1>
        <p className="text-sm text-gray-500">
          Укажите цену и сообщение заказчику
        </p>

        <Input
          id="price"
          label="Предлагаемая цена"
          type="number"
          placeholder="5000"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          error={errors.price}
        />

        <Textarea
          id="message"
          label="Сообщение"
          placeholder="Опишите, как вы выполните задачу..."
          rows={5}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          error={errors.message}
        />

        {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

        <Button type="submit" loading={loading} className="w-full">
          Отправить отклик
        </Button>
      </form>
    </AppLayout>
  );
}
