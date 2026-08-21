"use client";

import { LOOK_OFFICIAL_WEBSITE_URL } from "@/lib/brand/official-site";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

type OfficialSiteLinkProps = {
  className?: string;
  children?: ReactNode;
  showIcon?: boolean;
};

/**
 * Opens the official LOOK marketing site in an external browser tab.
 * Desktop Electron routes target=_blank via shell.openExternal.
 */
export function OfficialSiteLink({
  className,
  children,
  showIcon = false,
}: OfficialSiteLinkProps) {
  const { t } = useTranslation();
  const label = children ?? t("brand.officialSite");

  return (
    <a
      href={LOOK_OFFICIAL_WEBSITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("text-brand-600", className)}
    >
      {showIcon ? (
        <span className="inline-flex items-center gap-2">
          {label}
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
        </span>
      ) : (
        label
      )}
    </a>
  );
}
