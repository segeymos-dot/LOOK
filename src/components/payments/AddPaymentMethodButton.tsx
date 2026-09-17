"use client";

import { BillingInfoModal } from "@/components/payments/BillingInfoModal";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { CreditCard } from "lucide-react";
import { useState } from "react";

/** Opens the “add card” path. No Stripe Elements / no card fields until provider is live. */
export function AddPaymentMethodButton({
  className,
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        className={className ?? "w-full gap-2"}
        size="lg"
        onClick={() => setOpen(true)}
        data-testid="add-payment-method"
      >
        <CreditCard className="h-5 w-5 shrink-0" />
        {t("paymentsPayouts.addCard")}
      </Button>
      <BillingInfoModal
        open={open}
        title={t("paymentsPayouts.addCardTitle")}
        body={t("paymentsPayouts.addCardBody")}
        footnote={t("paymentsPayouts.addCardFootnote")}
        confirmLabel={t("paymentsPayouts.gotIt")}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
