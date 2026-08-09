"use client";

import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/components/providers/LocaleProvider";

/**
 * CTA for customer-only accounts to start provider onboarding → role both.
 */
export function BecomeProviderCard() {
  const { displayProfile, isCustomer, isProvider } = useAuth();
  const { t } = useTranslation();

  if (!displayProfile || !isCustomer || isProvider) return null;

  return (
    <Card padding="md" className="space-y-3 border-brand-100 bg-brand-50/40">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Briefcase className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("onboarding.becomeProvider.title")}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            {t("onboarding.becomeProvider.description")}
          </p>
        </div>
      </div>
      <Link href="/onboarding/provider" className="block">
        <Button className="w-full gap-2">
          <Briefcase className="h-4 w-4" />
          {t("onboarding.becomeProvider.cta")}
        </Button>
      </Link>
    </Card>
  );
}
