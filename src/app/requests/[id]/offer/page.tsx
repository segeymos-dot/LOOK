"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/hooks/useAuth";
import { canActAsProvider } from "@/lib/auth/roles";
import { getAuthenticatedUser } from "@/lib/auth/client-fetch";
import { submitOffer } from "@/lib/data/submit-offer";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { offerSchema } from "@/lib/validations";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

export default function NewOfferPage() {
  const { id: requestId } = useParams<{ id: string }>();
  const router = useRouter();
  const { displayProfile, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    price: "",
    message: "",
  });

  useEffect(() => {
    if (isDemoMode()) {
      setCheckingAccess(false);
      return;
    }

    if (authLoading) return;

    if (displayProfile && !canActAsProvider(displayProfile.role)) {
      setCheckingAccess(false);
      return;
    }

    const checkExistingOffer = async () => {
      const user = await getAuthenticatedUser();
      if (!user) {
        router.replace(`/login?redirect=/requests/${requestId}/offer`);
        return;
      }

      const supabase = createClient();
      const { data: existingOffer } = await supabase
        .from("offers")
        .select("id, status")
        .eq("request_id", requestId)
        .eq("provider_id", user.id)
        .maybeSingle();

      if (existingOffer?.status === "pending" || existingOffer?.status === "accepted") {
        router.replace(`/requests/${requestId}`);
        return;
      }

      setCheckingAccess(false);
    };

    void checkExistingOffer();
  }, [authLoading, displayProfile, requestId, router]);

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

  if (checkingAccess || authLoading) {
    return (
      <AppLayout hideNav>
        <div className="flex items-center justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        </div>
      </AppLayout>
    );
  }

  if (displayProfile && !canActAsProvider(displayProfile.role)) {
    return (
      <AppLayout hideNav>
        <div className="space-y-4 p-4">
          <PageHeader title="Отклик" backHref={`/requests/${requestId}`} />
          <Card padding="md" className="border-amber-200 bg-warning-bg">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm text-amber-900">
                  Откликаться на заказы могут только исполнители. Измените роль в профиле.
                </p>
                <Link href="/profile" className="mt-3 inline-block">
                  <Button size="sm">Профиль</Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout hideNav>
      <form onSubmit={handleSubmit} className="space-y-5 p-4">
        <PageHeader
          title="Откликнуться"
          subtitle="Укажите цену и сообщение заказчику"
          backHref={`/requests/${requestId}`}
        />

        <Card padding="md" className="space-y-4">
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
        </Card>

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          Отправить отклик
        </Button>
      </form>
    </AppLayout>
  );
}
