export function mapOfferActionError(message: string): string {
  if (message.includes("accept_offer") && message.includes("schema cache")) {
    return "Функция accept_offer не найдена в Supabase. Выполните supabase/migrations/008_deploy_offer_rpc.sql в SQL Editor.";
  }
  if (message.includes("Offer not found, not pending, or not authorized")) {
    return "Предложение недоступно: уже обработано или нет прав.";
  }
  return message;
}
