"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { AdminLinkRow } from "@/components/admin/AdminLinkRow";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/components/providers/LocaleProvider";
import { useRequirePlatformAdmin } from "@/hooks/useRequirePlatformAdmin";
import { authFetch } from "@/lib/auth/client-fetch";
import type { AdminConversationRecord } from "@/lib/admin/directory";
import { MessageSquare } from "lucide-react";

export default function AdminConversationPage() {
  const params = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { pending, allowed } = useRequirePlatformAdmin();
  const [record, setRecord] = useState<AdminConversationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pending || !allowed) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/admin/conversations/${params.id}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(t("admin.errors.loadFailed"));
          setRecord(null);
          return;
        }
        setRecord(data.record);
      } catch {
        setError(t("admin.errors.loadFailed"));
        setRecord(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [pending, allowed, params.id, t]);

  if (pending || !allowed) return null;

  return (
    <AppLayout hideNav title={t("admin.record.conversations")}>
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title={t("admin.record.conversations")}
          subtitle={record?.request_title ?? undefined}
          backHref="/admin/customers"
        />
        <AdminSectionNav activeHref="/admin/customers" />

        {loading && <p className="text-sm text-text-muted">{t("common.loading")}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        {record && (
          <>
            <Card padding="md" className="space-y-2 text-sm text-text-secondary">
              <p>
                <span className="text-text-muted">{t("admin.directory.provider")}: </span>
                {record.provider_name ?? "—"}
              </p>
              <p>
                <span className="text-text-muted">{t("admin.links.openCustomer")}: </span>
                {record.customer_name ?? "—"}
              </p>
              <AdminLinkRow
                links={[
                  { href: `/requests/${record.request_id}`, label: t("admin.links.openOrder") },
                  {
                    href: `/admin/customers/${record.customer_id}`,
                    label: t("admin.links.openCustomer"),
                  },
                  {
                    href: `/admin/providers/${record.provider_id}`,
                    label: t("admin.links.openProvider"),
                  },
                ]}
              />
            </Card>

            {record.messages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={t("admin.directory.emptyConversations")}
              />
            ) : (
              <div className="space-y-2">
                {record.messages.map((m) => (
                  <Card key={m.id} padding="sm" className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-text-primary">
                        {m.sender_name ?? "—"}
                      </p>
                      <p className="text-xs text-text-muted">
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-text-secondary">{m.content}</p>
                    {(m.sender_id === record.customer_id ||
                      m.sender_id === record.provider_id) && (
                      <Link
                        href={
                          m.sender_id === record.customer_id
                            ? `/admin/customers/${m.sender_id}`
                            : `/admin/providers/${m.sender_id}`
                        }
                        className="text-xs font-medium text-brand-600"
                      >
                        {m.sender_id === record.customer_id
                          ? t("admin.links.openCustomer")
                          : t("admin.links.openProvider")}
                      </Link>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
