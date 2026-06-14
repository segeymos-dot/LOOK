export type TestAccountRole = "customer" | "provider";

export interface TestAccount {
  id: string;
  label: string;
  email: string;
  password: string;
  fullName: string;
  role: TestAccountRole;
}

export function isTestLoginEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true") return true;
  if (process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "false") return false;
  return process.env.NODE_ENV === "development";
}

export function getTestAccounts(): TestAccount[] {
  return [
    {
      id: "customer",
      label: "Заказчик",
      email:
        process.env.NEXT_PUBLIC_TEST_CUSTOMER_EMAIL ?? "customer@test.look",
      password:
        process.env.NEXT_PUBLIC_TEST_CUSTOMER_PASSWORD ?? "Test1234!",
      fullName: "Test Customer",
      role: "customer",
    },
    {
      id: "provider",
      label: "Исполнитель",
      email:
        process.env.NEXT_PUBLIC_TEST_PROVIDER_EMAIL ?? "provider@test.look",
      password:
        process.env.NEXT_PUBLIC_TEST_PROVIDER_PASSWORD ?? "Test1234!",
      fullName: "Test Provider",
      role: "provider",
    },
  ];
}

export function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("database error querying schema") ||
    lower.includes("database error finding user")
  ) {
    return "Тестовые пользователи созданы через SQL с ошибкой. Выполните supabase/migrations/006_fix_seeded_auth_users.sql в SQL Editor Supabase.";
  }
  if (lower.includes("rate limit") || lower.includes("email rate")) {
    return "Превышен лимит отправки email в Supabase. Отключите подтверждение email в настройках Auth или войдите через тестовый аккаунт.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "Этот email уже зарегистрирован. Войдите или используйте другой адрес.";
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return "Некорректный email. Используйте реальный адрес или тестовый вход.";
  }
  return message;
}
