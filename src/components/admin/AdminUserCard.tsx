"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/components/providers/LocaleProvider";
import type { AdminUserListItem } from "@/lib/admin/directory";
import { formatPrice } from "@/lib/utils";

export function AdminUserCard({
  user,
  kind,
}: {
  user: AdminUserListItem;
  kind: "customers" | "providers";
}) {
  const { t } = useTranslation();
  const href =
    kind === "customers" ? `/admin/customers/${user.id}` : `/admin/providers/${user.id}`;

  return (
    <Link href={href} className="block">
      <Card padding="md" className="transition-colors hover:bg-surface-muted/60">
        <div className="flex items-start gap-3">
          <Avatar src={user.avatar_url} name={user.full_name} size="md" ring />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-text-primary">{user.full_name}</p>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-text-secondary">
                {user.role}
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {t("admin.directory.statusActive")}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-text-secondary">
              {user.email ?? t("admin.directory.emailUnavailable")}
            </p>
            <p className="truncate text-xs text-text-muted">
              {[user.phone, user.city].filter(Boolean).join(" · ") || "—"}
            </p>

            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary sm:grid-cols-3">
              <span>
                {t("admin.directory.registered")}:{" "}
                {new Date(user.created_at).toLocaleDateString()}
              </span>
              <span>
                {t("admin.directory.lastActivity")}:{" "}
                {new Date(user.last_activity_at).toLocaleDateString()}
              </span>
              {kind === "customers" ? (
                <>
                  <span>
                    {t("admin.directory.ordersCreated")}: {user.requests_created}
                  </span>
                  <span>
                    {t("admin.directory.ordersCompleted")}: {user.requests_completed}
                  </span>
                  <span>
                    {t("admin.directory.ordersCancelled")}: {user.requests_cancelled}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {t("admin.directory.offersSubmitted")}: {user.offers_submitted}
                  </span>
                  <span>
                    {t("admin.directory.jobsCompleted")}: {user.jobs_completed}
                  </span>
                  <span>
                    {t("admin.directory.rating")}: {user.rating.toFixed(1)} ({user.reviews_count})
                  </span>
                  {user.profile_complete != null && (
                    <span>
                      {t("admin.directory.profileComplete")}:{" "}
                      {user.profile_complete
                        ? t("admin.directory.yes")
                        : t("admin.directory.no")}
                    </span>
                  )}
                  {user.total_earned != null && (
                    <span>
                      {t("admin.directory.totalEarned")}:{" "}
                      {formatPrice(user.total_earned, user.balance_currency ?? "USD")}
                    </span>
                  )}
                </>
              )}
              <span>
                {t("admin.directory.disputes")}: {user.disputes_count}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
