"use client";

import { BillingInfoModal } from "@/components/payments/BillingInfoModal";
import { PayoutStatusBadge } from "@/components/payments/PayoutStatusBadge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { PayoutUiStatus } from "@/lib/payments/billing-ui-state";
import { Banknote } from "lucide-react";
import { useState } from "react";

/**
 * Provider payout setup surface.
 * No bank/account fields until a payout provider is connected.
 */
export function PayoutSetupCard({
  status = "not_connected",
}: {
  status?: PayoutUiStatus;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Card padding="lg" className="space-y-4" data-testid="payout-setup-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold uppercase tracking-wide text-text-primary">
            {t("paymentsPayouts.payoutsTitle")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            {t("paymentsPayouts.payoutsDesc")}
          </p>
        </div>
        <PayoutStatusBadge status={status} />
      </div>

      <Button
        type="button"
        className="w-full gap-2"
        size="lg"
        onClick={() => setOpen(true)}
        data-testid="setup-payouts"
      >
        <Banknote className="h-5 w-5 shrink-0" />
        {t("paymentsPayouts.setupPayouts")}
      </Button>

      <BillingInfoModal
        open={open}
        title={t("paymentsPayouts.payoutSetupTitle")}
        body={`${t("paymentsPayouts.payoutSetupStatusLine")}\n\n${t("paymentsPayouts.payoutSetupBody")}`}
        footnote={t("paymentsPayouts.payoutSetupFootnote")}
        confirmLabel={t("paymentsPayouts.gotIt")}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}
