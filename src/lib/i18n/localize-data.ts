import type { Locale } from "@/lib/i18n";
import {
  CATEGORY_LABELS,
  CATEGORY_LABEL_LINES,
  translateDemoString,
} from "@/lib/i18n/demo-data-translations";
import { localizeChatMessageContent } from "@/lib/data/work-lifecycle-messages";
import type {
  Category,
  Conversation,
  Message,
  Offer,
  PortfolioItem,
  Profile,
  Request,
  Review,
} from "@/types";

export function getCategoryLabel(slug: string, locale: Locale): string {
  const entry = CATEGORY_LABELS[slug];
  if (!entry) return slug;
  return locale === "en" ? entry.en : entry.ru;
}

export function getCompactCategoryLines(
  slug: string | null | undefined,
  locale: Locale
): string[] | null {
  if (!slug) return null;
  const entry = CATEGORY_LABEL_LINES[slug];
  if (!entry) return null;
  return locale === "en" ? entry.en : entry.ru;
}

export function localizeCategoryName(
  category: Pick<Category, "name" | "slug">,
  locale: Locale
): string {
  const slug = category.slug ?? "";
  const bySlug = slug ? CATEGORY_LABELS[slug] : undefined;
  if (bySlug) return locale === "en" ? bySlug.en : bySlug.ru;
  const name = category.name ?? "";
  if (name) return translateDemoString(name, locale);
  return slug;
}

export function localizeCategory(category: Category, locale: Locale): Category {
  return { ...category, name: localizeCategoryName(category, locale) };
}

export function localizeCategories(categories: Category[], locale: Locale): Category[] {
  return categories.map((c) => localizeCategory(c, locale));
}

export function localizeText(text: string | null | undefined, locale: Locale): string {
  if (!text) return text ?? "";
  return translateDemoString(text, locale);
}

export function localizeProfile(profile: Profile, locale: Locale): Profile {
  return {
    ...profile,
    full_name: localizeText(profile.full_name, locale),
    bio: profile.bio ? localizeText(profile.bio, locale) : profile.bio,
    city: profile.city ? localizeText(profile.city, locale) : profile.city,
    country: profile.country ? localizeText(profile.country, locale) : profile.country,
    skills: profile.skills ? localizeText(profile.skills, locale) : profile.skills,
    portfolio_items: profile.portfolio_items?.map((item) =>
      localizePortfolioItem(item, locale)
    ),
  };
}

export function localizePortfolioItem(item: PortfolioItem, locale: Locale): PortfolioItem {
  return {
    ...item,
    title: localizeText(item.title, locale),
    description: localizeText(item.description, locale),
  };
}

export function localizeRequest(request: Request, locale: Locale): Request {
  return {
    ...request,
    title: localizeText(request.title, locale),
    description: localizeText(request.description, locale),
    location: request.location ? localizeText(request.location, locale) : request.location,
    revision_feedback: request.revision_feedback
      ? localizeText(request.revision_feedback, locale)
      : request.revision_feedback,
    category: request.category
      ? localizeCategory(request.category, locale)
      : request.category,
    customer: request.customer ? localizeProfile(request.customer, locale) : request.customer,
  };
}

export function localizeRequests(requests: Request[], locale: Locale): Request[] {
  return requests.map((r) => localizeRequest(r, locale));
}

export function localizeOffer(offer: Offer, locale: Locale): Offer {
  return {
    ...offer,
    message: localizeText(offer.message, locale),
    request: offer.request ? localizeRequest(offer.request, locale) : offer.request,
    provider: offer.provider ? localizeProfile(offer.provider, locale) : offer.provider,
  };
}

export function localizeOffers(offers: Offer[], locale: Locale): Offer[] {
  return offers.map((o) => localizeOffer(o, locale));
}

export function localizeConversation(
  conversation: Conversation,
  locale: Locale
): Conversation {
  return {
    ...conversation,
    request: conversation.request
      ? localizeRequest(conversation.request, locale)
      : conversation.request,
    customer: conversation.customer
      ? localizeProfile(conversation.customer, locale)
      : conversation.customer,
    provider: conversation.provider
      ? localizeProfile(conversation.provider, locale)
      : conversation.provider,
    last_message: conversation.last_message
      ? localizeMessage(conversation.last_message, locale)
      : conversation.last_message,
  };
}

export function localizeMessage(message: Message, locale: Locale): Message {
  return {
    ...message,
    content: localizeChatMessageContent(message.content, locale),
    sender: message.sender ? localizeProfile(message.sender, locale) : message.sender,
  };
}

export function localizeReview(review: Review, locale: Locale): Review {
  return {
    ...review,
    comment: localizeText(review.comment, locale),
    reviewer: review.reviewer
      ? {
          ...review.reviewer,
          full_name: localizeText(review.reviewer.full_name, locale),
        }
      : review.reviewer,
  };
}

export function localizeReviews(reviews: Review[], locale: Locale): Review[] {
  return reviews.map((r) => localizeReview(r, locale));
}
