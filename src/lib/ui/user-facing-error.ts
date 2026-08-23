const SERVICE_UNAVAILABLE =
  "Сервис временно недоступен. Попробуйте позже или обратитесь в поддержку LOOK.";

/** Maps technical/backend errors to user-readable Russian messages. */
export function mapUserFacingError(message: string): string {
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
    return SERVICE_UNAVAILABLE;
  }

  if (lower.includes("42703") || (lower.includes("column") && lower.includes("does not exist"))) {
    return "Не удалось сохранить профиль. Попробуйте позже или сохраните только основные поля.";
  }

  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "Нет прав для этого действия.";
  }

  if (
    lower.includes("database error querying schema") ||
    lower.includes("database error finding user")
  ) {
    return "Не удалось выполнить вход. Попробуйте позже или зарегистрируйтесь заново.";
  }

  if (lower.includes("invalid api key") || lower.includes("no api key found")) {
    return "Неверный ключ Supabase. Для Preview проверьте NEXT_PUBLIC_SUPABASE_URL и publishable/anon key (LOOK Staging), затем сделайте Redeploy — NEXT_PUBLIC_* подхватываются только при сборке.";
  }

  return message;
}
