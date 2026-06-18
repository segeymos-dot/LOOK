import Link from "next/link";
import { ProviderContactBar } from "@/components/providers/ProviderContactBar";
import { PortfolioGallery } from "@/components/profile/PortfolioGallery";
import { ProviderStats } from "@/components/profile/ProviderStats";
import { ReviewsList } from "@/components/profile/ReviewsList";
import { StarRating } from "@/components/profile/StarRating";
import { VerificationBadges } from "@/components/profile/VerificationBadges";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { formatRating, getProviderVerification } from "@/lib/profile/provider-utils";
import type { Category, Profile, Review } from "@/types";
import {
  Briefcase,
  MapPin,
  Pencil,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";

interface ProviderPublicProfileProps {
  profile: Profile;
  reviews: Review[];
  categories: Category[];
  emailVerified: boolean;
  chatHref: string | null;
  isAuthenticated: boolean;
  isOwnProfile: boolean;
  backHref?: string;
}

function Section({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-5 w-5 text-brand-600" />}
        <h2 className="text-lg font-bold tracking-tight text-text-primary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function ProviderPublicProfile({
  profile,
  reviews,
  categories,
  emailVerified,
  chatHref,
  isAuthenticated,
  isOwnProfile,
}: ProviderPublicProfileProps) {
  const verification = getProviderVerification(profile, emailVerified);
  const skills = profile.skills?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const rating = Number(profile.rating);
  const location = [profile.city, profile.country].filter(Boolean).join(", ");

  return (
    <div className="pb-4">
      {/* Hero */}
      <div className="relative overflow-hidden bg-surface">
        <div className="gradient-brand h-36 w-full" />
        <div className="relative -mt-20 px-4 pb-5">
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <Avatar
              src={profile.avatar_url}
              name={profile.full_name}
              size="2xl"
              ring
              className="shadow-elevated"
            />
            <div className="mt-4 space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                <UserRound className="h-3.5 w-3.5" />
                Исполнитель
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                {profile.full_name}
              </h1>
              {location && (
                <p className="flex items-center justify-center gap-1.5 text-sm text-text-secondary">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {location}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {formatRating(rating)}
                  {profile.reviews_count > 0 && (
                    <span className="font-normal text-text-muted">
                      ({profile.reviews_count} отзывов)
                    </span>
                  )}
                </span>
                {rating > 0 && <StarRating rating={rating} size="sm" />}
                <span className="inline-flex items-center gap-1 text-sm text-text-secondary">
                  <Briefcase className="h-4 w-4" />
                  {profile.completed_orders_count} заказов выполнено
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-5 px-4">
        <VerificationBadges verification={verification} className="justify-center" />

        <ProviderStats
          rating={rating}
          completedOrders={profile.completed_orders_count}
          reviewsCount={profile.reviews_count}
        />

        {!isOwnProfile && (
          <div className="hidden sm:block">
            <ProviderContactBar
              providerId={profile.id}
              chatHref={chatHref}
              isAuthenticated={isAuthenticated}
              isOwnProfile={isOwnProfile}
              variant="inline"
            />
          </div>
        )}

        {isOwnProfile && (
          <Link href="/profile">
            <Button variant="secondary" className="w-full gap-2">
              <Pencil className="h-4 w-4" />
              Редактировать профиль
            </Button>
          </Link>
        )}

        <Section title="О себе" icon={Sparkles}>
          <Card padding="md">
            {profile.bio ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                {profile.bio}
              </p>
            ) : (
              <p className="text-sm text-text-muted">Исполнитель пока не добавил описание</p>
            )}
          </Card>
        </Section>

        {skills.length > 0 && (
          <Section title="Навыки">
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <Chip key={skill} variant="brand">
                  {skill}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        {categories.length > 0 && (
          <Section title="Категории услуг">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Chip key={cat.id}>{cat.name}</Chip>
              ))}
            </div>
          </Section>
        )}

        <PortfolioGallery items={profile.portfolio_items} variant="public" />

        <ReviewsList
          reviews={reviews}
          title="Отзывы"
          showSummary
          averageRating={rating}
        />
      </div>

      {!isOwnProfile && (
        <ProviderContactBar
          providerId={profile.id}
          chatHref={chatHref}
          isAuthenticated={isAuthenticated}
          isOwnProfile={isOwnProfile}
          variant="sticky"
        />
      )}
    </div>
  );
}
