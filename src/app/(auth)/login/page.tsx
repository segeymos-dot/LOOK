import { LoginForm } from "./LoginForm";
import { LOOK_LAST_LOGIN_EMAIL_COOKIE } from "@/lib/auth/recent-login-emails";
import { cookies } from "next/headers";
import { Suspense } from "react";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOOK_LAST_LOGIN_EMAIL_COOKIE)?.value ?? "";
  const initialEmail = raw.trim().toLowerCase();

  return (
    <Suspense>
      <LoginForm initialEmail={initialEmail} />
    </Suspense>
  );
}
