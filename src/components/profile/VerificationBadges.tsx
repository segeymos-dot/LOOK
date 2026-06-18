import { cn } from "@/lib/utils";
import type { ProviderVerification } from "@/types";
import { BadgeCheck, Mail, Phone, UserCheck } from "lucide-react";

interface VerificationBadgesProps {
  verification: ProviderVerification;
  className?: string;
}

const badges = [
  {
    key: "phoneVerified" as const,
    label: "Телефон подтверждён",
    icon: Phone,
  },
  {
    key: "emailVerified" as const,
    label: "Email подтверждён",
    icon: Mail,
  },
  {
    key: "profileComplete" as const,
    label: "Профиль заполнен",
    icon: UserCheck,
  },
];

export function VerificationBadges({ verification, className }: VerificationBadgesProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {badges.map(({ key, label, icon: Icon }) => {
        const verified = verification[key];
        return (
          <span
            key={key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
              verified
                ? "bg-success-bg text-emerald-700"
                : "bg-slate-100 text-text-muted"
            )}
          >
            {verified ? (
              <BadgeCheck className="h-3.5 w-3.5" />
            ) : (
              <Icon className="h-3.5 w-3.5 opacity-50" />
            )}
            {verified ? `✔ ${label}` : label}
          </span>
        );
      })}
    </div>
  );
}
