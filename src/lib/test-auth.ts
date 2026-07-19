export type TestAccountRole = "customer" | "provider" | "both";

export interface TestAccount {
  id: string;
  label: string;
  email: string;
  password: string;
  fullName: string;
  role: TestAccountRole;
  isPlatformAdmin?: boolean;
}

export function isTestLoginEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
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
    {
      id: "admin",
      label: "Админ",
      email: process.env.NEXT_PUBLIC_TEST_ADMIN_EMAIL ?? "admin@test.look",
      password: process.env.NEXT_PUBLIC_TEST_ADMIN_PASSWORD ?? "Test1234!",
      fullName: "LOOK Admin",
      role: "both",
      isPlatformAdmin: true,
    },
  ];
}

import { mapUserFacingError } from "@/lib/ui/user-facing-error";

export function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("email rate")) {
    return "Превышен лимит отправки писем. Подождите немного и попробуйте снова.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "Этот email уже зарегистрирован. Войдите или используйте другой адрес.";
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return "Некорректный email. Проверьте адрес и попробуйте снова.";
  }
  if (lower.includes("email not confirmed")) {
    return "Email не подтверждён. Проверьте почту или запросите письмо повторно.";
  }
  return mapUserFacingError(message);
}
