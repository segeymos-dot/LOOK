import type { Locale } from "@/lib/i18n";
import { getNestedValue } from "@/lib/i18n";
import { en } from "@/lib/i18n/locales/en";
import { ru } from "@/lib/i18n/locales/ru";
import type { WorkAttachment } from "@/types";

export const WORK_SUBMIT_PREFIX = "LOOK:WORK_SUBMIT:";
export const WORK_REVISION_PREFIX = "LOOK:WORK_REVISION:";
export const WORK_ACCEPTED_PREFIX = "LOOK:WORK_ACCEPTED:";
export const ORDER_CANCELLED_PREFIX = "LOOK:ORDER_CANCELLED:";
export const ORDER_REFUNDED_PREFIX = "LOOK:ORDER_REFUNDED:";
export const ORDER_DISPUTE_PREFIX = "LOOK:ORDER_DISPUTE:";

/** Exact system texts historically written by SQL RPC / older app code. */
export const LEGACY_WORK_SUBMIT_MESSAGES = [
  "📋 Работа сдана на проверку заказчику.",
  "📋 Work submitted for customer review.",
] as const;

export const LEGACY_WORK_REVISION_MESSAGES = [
  "🔄 Заказ отправлен на доработку.",
  "🔄 Order sent back for revision.",
] as const;

export const LEGACY_WORK_ACCEPTED_MESSAGES = [
  "✅ Заказчик принял работу. Заказ завершён.",
  "✅ Customer accepted the work. Order completed.",
] as const;

export type WorkLifecyclePayload = {
  summary: string;
  attachments: WorkAttachment[];
  revision: number;
};

export type WorkRevisionPayload = {
  feedback: string;
};

export type OrderCancelledPayload = {
  reason: string;
  outcome: "cancelled_unpaid";
};

export type OrderRefundedPayload = {
  reason: string;
  amount: number;
  currency: string;
};

export type OrderDisputePayload = {
  reason: string;
};

export type SystemChatLabels = {
  workSubmitted: string;
  workRevision: string;
  workAccepted: string;
  attachments: string;
  orderCancelled: string;
  orderRefunded: string;
  orderDispute: string;
};

function chatLabels(locale: Locale): SystemChatLabels {
  const dict = (locale === "en" ? en : ru) as Record<string, unknown>;
  const pick = (key: string, fallback: string) => getNestedValue(dict, key) ?? fallback;
  return {
    workSubmitted: pick("chat.workSubmitted", LEGACY_WORK_SUBMIT_MESSAGES[locale === "en" ? 1 : 0]),
    workRevision: pick("chat.workRevision", LEGACY_WORK_REVISION_MESSAGES[locale === "en" ? 1 : 0]),
    workAccepted: pick("chat.workAccepted", LEGACY_WORK_ACCEPTED_MESSAGES[locale === "en" ? 1 : 0]),
    attachments: pick("chat.attachments", locale === "en" ? "Attachments:" : "Вложения:"),
    orderCancelled: pick(
      "chat.orderCancelled",
      locale === "en" ? "🚫 Order cancelled." : "🚫 Заказ отменён."
    ),
    orderRefunded: pick(
      "chat.orderRefunded",
      locale === "en"
        ? "💸 Customer refund issued. Payment marked as refunded."
        : "💸 Возврат заказчику выполнен. Платёж отмечен как возвращённый."
    ),
    orderDispute: pick(
      "chat.orderDispute",
      locale === "en"
        ? "⚠️ Dispute opened. Refund is pending review."
        : "⚠️ Открыт спор. Возврат ожидает рассмотрения."
    ),
  };
}

export function encodeWorkSubmit(payload: WorkLifecyclePayload): string {
  return `${WORK_SUBMIT_PREFIX}${JSON.stringify(payload)}`;
}

export function encodeWorkRevision(payload: WorkRevisionPayload): string {
  return `${WORK_REVISION_PREFIX}${JSON.stringify(payload)}`;
}

export function encodeWorkAccepted(): string {
  return `${WORK_ACCEPTED_PREFIX}{}`;
}

export function encodeOrderCancelled(payload: OrderCancelledPayload): string {
  return `${ORDER_CANCELLED_PREFIX}${JSON.stringify(payload)}`;
}

export function encodeOrderRefunded(payload: OrderRefundedPayload): string {
  return `${ORDER_REFUNDED_PREFIX}${JSON.stringify(payload)}`;
}

export function encodeOrderDispute(payload: OrderDisputePayload): string {
  return `${ORDER_DISPUTE_PREFIX}${JSON.stringify(payload)}`;
}

function parseLifecycleJson<T>(content: string, prefix: string): T | null {
  if (!content.startsWith(prefix)) return null;
  const rest = content.slice(prefix.length);
  const newlineIndex = rest.indexOf("\n");
  const jsonPart = newlineIndex === -1 ? rest.trim() : rest.slice(0, newlineIndex).trim();
  if (!jsonPart) return null;
  try {
    return JSON.parse(jsonPart) as T;
  } catch {
    return null;
  }
}

export function parseWorkSubmit(content: string): WorkLifecyclePayload | null {
  return parseLifecycleJson<WorkLifecyclePayload>(content, WORK_SUBMIT_PREFIX);
}

export function parseWorkRevision(content: string): WorkRevisionPayload | null {
  return parseLifecycleJson<WorkRevisionPayload>(content, WORK_REVISION_PREFIX);
}

function normalizeSystemLine(content: string): string {
  return content.trim();
}

function matchesLegacy(content: string, legacy: readonly string[]): boolean {
  const normalized = normalizeSystemLine(content);
  return legacy.some((line) => normalized === line || normalized.startsWith(`${line}\n`));
}

export function isWorkLifecycleMessage(content: string): boolean {
  return (
    content.startsWith(WORK_SUBMIT_PREFIX) ||
    content.startsWith(WORK_REVISION_PREFIX) ||
    content.startsWith(WORK_ACCEPTED_PREFIX) ||
    content.startsWith(ORDER_CANCELLED_PREFIX) ||
    content.startsWith(ORDER_REFUNDED_PREFIX) ||
    content.startsWith(ORDER_DISPUTE_PREFIX) ||
    matchesLegacy(content, LEGACY_WORK_SUBMIT_MESSAGES) ||
    matchesLegacy(content, LEGACY_WORK_REVISION_MESSAGES) ||
    matchesLegacy(content, LEGACY_WORK_ACCEPTED_MESSAGES)
  );
}

export function formatWorkSubmitDisplay(
  payload: WorkLifecyclePayload,
  labels: SystemChatLabels,
  _locale: Locale = "ru"
): string {
  const lines = [labels.workSubmitted, "", payload.summary.trim()];
  if (payload.attachments.length > 0) {
    lines.push("", labels.attachments);
    for (const attachment of payload.attachments) {
      lines.push(`• ${attachment.name}: ${attachment.url}`);
    }
  }
  return lines.join("\n");
}

export function formatWorkRevisionDisplay(
  payload: WorkRevisionPayload,
  labels: SystemChatLabels,
  _locale: Locale = "ru"
): string {
  return `${labels.workRevision}\n\n${payload.feedback.trim()}`;
}

export function formatWorkAcceptedDisplay(labels: SystemChatLabels): string {
  return labels.workAccepted;
}

/**
 * Localize system-generated chat content for the active UI locale.
 * User-written messages are returned unchanged (aside from demo-string localization).
 */
export function localizeChatMessageContent(content: string, locale: Locale): string {
  const labels = chatLabels(locale);

  const submit = parseWorkSubmit(content);
  if (submit) return formatWorkSubmitDisplay(submit, labels, locale);

  const revision = parseWorkRevision(content);
  if (revision) return formatWorkRevisionDisplay(revision, labels, locale);

  if (content.startsWith(WORK_ACCEPTED_PREFIX)) {
    return formatWorkAcceptedDisplay(labels);
  }

  const isUserEnteredReason = (reason?: string | null) => {
    const r = reason?.trim();
    if (!r) return false;
    // Stable system codes stay out of chat UI; free-text reasons stay verbatim.
    return !/^[a-z][a-z0-9_]*$/i.test(r);
  };

  const cancelled = parseLifecycleJson<OrderCancelledPayload>(content, ORDER_CANCELLED_PREFIX);
  if (cancelled) {
    return isUserEnteredReason(cancelled.reason)
      ? `${labels.orderCancelled}\n\n${cancelled.reason.trim()}`
      : labels.orderCancelled;
  }

  const refunded = parseLifecycleJson<OrderRefundedPayload>(content, ORDER_REFUNDED_PREFIX);
  if (refunded) {
    const amountLine =
      refunded.amount != null
        ? `${refunded.amount} ${refunded.currency || ""}`.trim()
        : "";
    const parts = [labels.orderRefunded];
    if (amountLine) parts.push(amountLine);
    if (isUserEnteredReason(refunded.reason)) parts.push(refunded.reason.trim());
    return parts.join("\n\n");
  }

  const dispute = parseLifecycleJson<OrderDisputePayload>(content, ORDER_DISPUTE_PREFIX);
  if (dispute) {
    return isUserEnteredReason(dispute.reason)
      ? `${labels.orderDispute}\n\n${dispute.reason.trim()}`
      : labels.orderDispute;
  }

  const normalized = normalizeSystemLine(content);

  for (const legacy of LEGACY_WORK_SUBMIT_MESSAGES) {
    if (normalized === legacy) return labels.workSubmitted;
    if (normalized.startsWith(`${legacy}\n`)) {
      const rest = normalized.slice(legacy.length).replace(/^\n+/, "");
      return rest ? `${labels.workSubmitted}\n\n${rest}` : labels.workSubmitted;
    }
  }

  for (const legacy of LEGACY_WORK_REVISION_MESSAGES) {
    if (normalized === legacy) return labels.workRevision;
    if (normalized.startsWith(`${legacy}\n`)) {
      const rest = normalized.slice(legacy.length).replace(/^\n+/, "");
      return rest ? `${labels.workRevision}\n\n${rest}` : labels.workRevision;
    }
  }

  for (const legacy of LEGACY_WORK_ACCEPTED_MESSAGES) {
    if (normalized === legacy || normalized.startsWith(`${legacy}\n`)) {
      return labels.workAccepted;
    }
  }

  // Keep user-written chat content exactly as stored.
  return content;
}

/** @deprecated Prefer localizeChatMessageContent — kept for scripts/tests. */
export function displayMessageContent(content: string): string {
  return localizeChatMessageContent(content, "ru");
}
