export function isDuplicateConfirmedSignup(user: {
  identities?: { id: string }[] | null;
} | null): boolean {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}

export const DEV_EMAIL_CONFIRM_HINT =
  "В dev-режиме Supabase отправляет письма через встроенную почту с жёстким лимитом (≈2–4 письма в час). " +
  "Если письмо не пришло: проверьте «Спам», подождите 15–60 минут и нажмите «Отправить повторно», " +
  "либо настройте SMTP в Supabase (Authentication → SMTP) для надёжной доставки на Gmail.";

export const SUPABASE_REDIRECT_URLS_HINT =
  "Добавьте в Supabase → Authentication → URL Configuration → Redirect URLs: " +
  "http://localhost:3000/auth/callback, http://127.0.0.1:3010/auth/callback";
