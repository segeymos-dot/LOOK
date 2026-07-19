import type { WorkAttachment } from "@/types";

export const WORK_SUBMIT_PREFIX = "LOOK:WORK_SUBMIT:";
export const WORK_REVISION_PREFIX = "LOOK:WORK_REVISION:";
export const WORK_ACCEPTED_PREFIX = "LOOK:WORK_ACCEPTED:";

export type WorkLifecyclePayload = {
  summary: string;
  attachments: WorkAttachment[];
  revision: number;
};

export type WorkRevisionPayload = {
  feedback: string;
};

export function encodeWorkSubmit(payload: WorkLifecyclePayload): string {
  return `${WORK_SUBMIT_PREFIX}${JSON.stringify(payload)}`;
}

export function encodeWorkRevision(payload: WorkRevisionPayload): string {
  return `${WORK_REVISION_PREFIX}${JSON.stringify(payload)}`;
}

export function encodeWorkAccepted(): string {
  return `${WORK_ACCEPTED_PREFIX}{}`;
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

export function isWorkLifecycleMessage(content: string): boolean {
  return (
    content.startsWith(WORK_SUBMIT_PREFIX) ||
    content.startsWith(WORK_REVISION_PREFIX) ||
    content.startsWith(WORK_ACCEPTED_PREFIX)
  );
}

export function formatWorkSubmitDisplay(payload: WorkLifecyclePayload): string {
  const lines = ["📋 Работа сдана на проверку заказчику.", "", payload.summary.trim()];
  if (payload.attachments.length > 0) {
    lines.push("", "Вложения:");
    for (const attachment of payload.attachments) {
      lines.push(`• ${attachment.name}: ${attachment.url}`);
    }
  }
  return lines.join("\n");
}

export function formatWorkRevisionDisplay(payload: WorkRevisionPayload): string {
  return `🔄 Заказ отправлен на доработку.\n\n${payload.feedback.trim()}`;
}

export function formatWorkAcceptedDisplay(): string {
  return "✅ Заказчик принял работу. Заказ завершён.";
}

export function displayMessageContent(content: string): string {
  const submit = parseWorkSubmit(content);
  if (submit) return formatWorkSubmitDisplay(submit);

  const revision = parseWorkRevision(content);
  if (revision) return formatWorkRevisionDisplay(revision);

  if (content.startsWith(WORK_ACCEPTED_PREFIX)) return formatWorkAcceptedDisplay();

  return content;
}
