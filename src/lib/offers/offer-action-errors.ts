import { mapUserFacingError } from "@/lib/ui/user-facing-error";

export function mapOfferActionError(message: string): string {
  if (message.includes("Offer not found, not pending, or not authorized")) {
    return "Предложение недоступно: уже обработано или нет прав.";
  }
  return mapUserFacingError(message);
}
