"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/hooks/useAuth";
import { getAuthenticatedUser } from "@/lib/auth/client-fetch";
import { canActAsProvider, canRespondToRequest } from "@/lib/auth/roles";
import { isRequestOwner as checkRequestOwner } from "@/lib/auth/viewer-role";
import { submitOffer } from "@/lib/data/submit-offer";
import { isDemoMode } from "@/lib/config";
import { mockCurrentUser } from "@/lib/mock/data";
import { createClient } from "@/lib/supabase/client";
import { offerSchema } from "@/lib/validations";
import type { Offer, RequestStatus } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Briefcase } from "lucide-react";

interface ProviderOfferRespondProps {
  requestId: string;
  customerId: string;
  requestStatus: RequestStatus;
  requestCurrency: string;
  offers: Offer[];
  viewerUserId?: string | null;
  viewerIsCustomer?: boolean;
  viewerCanActAsProvider?: boolean;
  isDemo?: boolean;
  onOfferSubmitted: (offer: Offer) => void;
}

export function ProviderOfferRespond({
  requestId,
  customerId,
  requestStatus,
  requestCurrency,
  offers,
  viewerUserId = null,
  viewerIsCustomer,
  viewerCanActAsProvider = false,
  isDemo = false,
  onOfferSubmitted,
}: ProviderOfferRespondProps) {
  const router = useRouter();
  const { user, loading: authLoading, displayProfile, isProvider } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ price: "", message: "" });

  const activeUserId = user?.id ?? viewerUserId;
  const ownOffer = activeUserId
    ? (offers.find((offer) => offer.provider_id === activeUserId) ?? null)
    : null;
  const isRequestOwner = checkRequestOwner({
    customerId,
    userId: activeUserId,
    viewerIsOwner: viewerIsCustomer,
    isDemo,
    demoUserId: mockCurrentUser.id,
  });

  const providerCapable =
    isProvider ||
    canActAsProvider(displayProfile?.role) ||
    viewerCanActAsProvider;

  const canRespond = canRespondToRequest({
    requestStatus,
    isRequestOwner,
    canActAsProvider: providerCapable,
    viewerUserId: activeUserId,
    customerId,
    ownOfferStatus: ownOffer?.status ?? null,
  });

  const hasActiveOffer =
    ownOffer?.status === "pending" || ownOffer?.status === "accepted";

  if (isRequestOwner || !providerCapable || requestStatus !== "open") {
    return null;
  }

  if (authLoading && !activeUserId) {
    return (
      <Card padding="md" className="animate-pulse">
        <div className="h-10 rounded-xl bg-slate-100" />
      </Card>
    );
  }

  if (!activeUserId) {
    return (
      <Card padding="md" className="border-brand-200 bg-brand-50">
        <p className="mb-3 text-sm text-text-secondary">
          Войдите как исполнитель, чтобы отправить предложение по этому заказу.
        </p>
        <Link href={`/login?redirect=/requests/${requestId}`}>
          <Button className="w-full" size="lg">
            Войти и откликнуться
          </Button>
        </Link>
      </Card>
    );
  }

  if (hasActiveOffer) {
    return (
      <Card padding="md" className="border-brand-200 bg-brand-50">
        <p className="text-sm font-medium text-brand-800">
          Вы уже откликнулись на этот заказ
        </p>
        {ownOffer?.status === "pending" && (
          <p className="mt-1 text-sm text-text-secondary">
            Ожидайте решения заказчика. Ваше предложение отображается ниже.
          </p>
        )}
      </Card>
    );
  }

  if (!canRespond) {
    return null;
  }

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
      if (isDemoMode() || isDemo) {
        const demoOffer: Offer = {
          id: `offer-demo-${Date.now()}`,
          request_id: requestId,
          provider_id: activeUserId,
          price: parsed.data.price,
          currency: requestCurrency,
          message: parsed.data.message,
          estimated_days: parsed.data.estimated_days ?? null,
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          provider: displayProfile ?? undefined,
        };
        onOfferSubmitted(demoOffer);
        setShowForm(false);
        setForm({ price: "", message: "" });
        return;
      }

      const authUser = await getAuthenticatedUser();
      if (!authUser) {
        router.push(`/login?redirect=/requests/${requestId}`);
        return;
      }

      const supabase = createClient();
      const result = await submitOffer(supabase, authUser.id, {
        requestId,
        price: parsed.data.price,
        message: parsed.data.message,
        estimatedDays: parsed.data.estimated_days,
      });

      if (!result.success) {
        setErrors({ form: result.error });
        return;
      }

      const { data: savedOffer } = await supabase
        .from("offers")
        .select("*, provider:profiles(*)")
        .eq("id", result.offerId)
        .single();

      if (savedOffer) {
        onOfferSubmitted(savedOffer as Offer);
      }

      setShowForm(false);
      setForm({ price: "", message: "" });
      router.refresh();
    } catch {
      setErrors({ form: "Не удалось отправить предложение" });
    } finally {
      setLoading(false);
    }
  };

  if (!showForm) {
    return (
      <Card padding="md">
        <div className="mb-3 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-brand-600" />
          <p className="font-semibold text-text-primary">Отклик исполнителя</p>
        </div>
        <p className="mb-4 text-sm text-text-secondary">
          Укажите цену и комментарий — заказчик увидит ваше предложение в разделе ниже.
        </p>
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => setShowForm(true)}
        >
          Откликнуться на заказ
        </Button>
      </Card>
    );
  }

  return (
    <Card padding="md">
      <div className="mb-4 flex items-center gap-2">
        <Briefcase className="h-5 w-5 text-brand-600" />
        <p className="font-semibold text-text-primary">Ваше предложение</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="offer-price"
          label="Цена"
          type="number"
          placeholder="5000"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          error={errors.price}
        />

        <Textarea
          id="offer-message"
          label="Комментарий исполнителя"
          placeholder="Опишите, как вы выполните задачу..."
          rows={4}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          error={errors.message}
        />

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => setShowForm(false)}
            disabled={loading}
          >
            Отмена
          </Button>
          <Button type="submit" loading={loading} className="flex-1">
            Отправить предложение
          </Button>
        </div>
      </form>
    </Card>
  );
}
