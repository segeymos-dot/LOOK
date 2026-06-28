import { AppLayout } from "@/components/layout/AppLayout";
import { ProviderPageHeader } from "@/components/providers/ProviderPageHeader";
import { ProviderPublicProfile } from "@/components/providers/ProviderPublicProfile";
import { canActAsProvider } from "@/lib/auth/roles";
import { getServerTranslation } from "@/lib/i18n/server";
import {
  getProviderMetadataProfile,
  resolveProviderPageData,
} from "@/lib/profile/resolve-provider-page";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

async function getMetadataProfile(id: string) {
  const mock = getProviderMetadataProfile(id);
  if (mock) return mock;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, bio, role")
    .eq("id", id)
    .single();

  return data;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await getMetadataProfile(id);
  const { t } = await getServerTranslation();

  if (!profile || !canActAsProvider(profile.role)) {
    return { title: `${t("provider.notFound")} — LOOK` };
  }

  return {
    title: t("provider.metaTitle", { name: profile.full_name }),
    description:
      profile.bio ?? t("provider.metaDescriptionFallback", { name: profile.full_name }),
  };
}

export default async function ProviderProfilePage({ params }: PageProps) {
  const { id } = await params;
  const data = await resolveProviderPageData(id);

  if (!data) notFound();

  return (
    <AppLayout hideNav title={data.profile.full_name}>
      <ProviderPageHeader />
      <ProviderPublicProfile
        profile={data.profile}
        reviews={data.reviews}
        categories={data.categories}
        emailVerified={data.emailVerified}
        chatHref={data.chatHref}
        isAuthenticated={data.isAuthenticated}
        isOwnProfile={data.isOwnProfile}
      />
    </AppLayout>
  );
}
