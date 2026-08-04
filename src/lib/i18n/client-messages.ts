import { z } from "zod";
import { ledgerCodeI18nKey, resolveLedgerCode } from "@/lib/finance/ledger";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function optionalString() {
  return z.string().optional().or(z.literal(""));
}

export function createLoginSchema(t: TFn) {
  return z.object({
    email: z.string().email(t("validation.emailInvalid")),
    password: z.string().min(6, t("validation.minPassword")),
  });
}

export function createRegisterSchema(t: TFn) {
  const optionalUrl = z
    .string()
    .url(t("validation.urlInvalid"))
    .optional()
    .or(z.literal(""));

  return z.object({
    full_name: z.string().min(2, t("validation.minName")),
    email: z.string().email(t("validation.emailInvalid")),
    password: z.string().min(6, t("validation.minPassword")),
    role: z.enum(["customer", "provider"]),
    phone: optionalString(),
    country: optionalString(),
    city: optionalString(),
    avatar_url: optionalUrl,
    bio: optionalString(),
    skills: optionalString(),
    portfolio: optionalString(),
    provider_category_slugs: z.array(z.string()).optional(),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: t("validation.acceptTerms") }),
    }),
  });
}

export function createForgotPasswordSchema(t: TFn) {
  return z.object({
    email: z.string().email(t("validation.emailInvalid")),
  });
}

export function createResetPasswordSchema(t: TFn) {
  return z
    .object({
      password: z.string().min(6, t("validation.minPassword")),
      confirmPassword: z.string().min(6, t("validation.minPassword")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("validation.passwordMismatch"),
      path: ["confirmPassword"],
    });
}

export function createRequestSchema(t: TFn) {
  return z.object({
    title: z.string().min(5, t("validation.minTitle")).max(100),
    description: z.string().min(20, t("validation.minDescription")).max(2000),
    category_id: z.string().uuid(t("validation.selectCategory")),
    budget: z.coerce.number().positive(t("validation.budgetPositive")),
    location: z.string().max(200).optional(),
    deadline: z.string().optional(),
  });
}

export function createOfferSchema(t: TFn) {
  return z.object({
    price: z.coerce.number().positive(t("validation.pricePositive")),
    message: z.string().min(10, t("validation.minMessage")).max(1000),
    estimated_days: z.coerce.number().int().positive().optional(),
  });
}

export function createReviewSchema(t: TFn) {
  return z.object({
    reviewee_id: z.string().uuid(),
    request_id: z.string().uuid(),
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().min(5, t("validation.minComment")).max(1000),
  });
}

export function createWorkSubmitSchema(t: TFn) {
  return z.object({
    summary: z.string().min(10, t("validation.minSummary")).max(5000),
    attachments: z
      .array(
        z.object({
          name: z.string().min(1),
          url: z.string().url(),
          type: z.enum(["image", "document", "link"]),
        })
      )
      .optional(),
  });
}

export function createRevisionSchema(t: TFn) {
  return z.object({
    feedback: z.string().min(5, t("validation.revisionFeedback")).max(2000),
  });
}

export function mapAuthErrorT(message: string, t: TFn): string {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("email rate")) {
    return t("auth.errors.rateLimit");
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return t("auth.errors.alreadyRegistered");
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return t("auth.errors.invalidEmail");
  }
  if (lower.includes("email not confirmed")) {
    return t("auth.errors.emailNotConfirmed");
  }
  return mapUserFacingErrorT(message, t);
}

export function mapUserFacingErrorT(message: string, t: TFn): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("schema cache") ||
    lower.includes("could not find the function") ||
    lower.includes("pgrst202") ||
    lower.includes("sql editor") ||
    lower.includes("migrations/") ||
    lower.includes(".env.local") ||
    lower.includes("service_role_key") ||
    lower.includes("supabase/migrations")
  ) {
    return t("errors.serviceUnavailable");
  }

  if (lower.includes("42703") || (lower.includes("column") && lower.includes("does not exist"))) {
    return t("errors.profileSave");
  }

  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return t("errors.permissionDenied");
  }

  if (
    lower.includes("database error querying schema") ||
    lower.includes("database error finding user")
  ) {
    return t("errors.signInFailed");
  }

  return message;
}

export function getTransactionTypeLabelT(
  type: string,
  t: TFn,
  ledgerCode?: string | null
): string {
  const code = resolveLedgerCode(type, ledgerCode);
  return t(ledgerCodeI18nKey(String(code)));
}

export function getRoleLabelT(role: string | null | undefined, t: TFn): string {
  switch (role) {
    case "customer":
      return t("role.customer");
    case "provider":
      return t("role.provider");
    case "both":
      return t("role.both");
    default:
      return t("role.user");
  }
}

export function formatRelativeTimeT(date: string, t: TFn, locale = "ru-RU"): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("time.justNow");
  if (diffMins < 60) return t("time.minutesAgo", { n: diffMins });
  if (diffHours < 24) return t("time.hoursAgo", { n: diffHours });
  if (diffDays < 7) return t("time.daysAgo", { n: diffDays });

  return then.toLocaleDateString(locale === "en" ? "en-US" : locale, {
    day: "numeric",
    month: "short",
  });
}
