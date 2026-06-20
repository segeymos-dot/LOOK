import { getTestAccounts } from "@/lib/test-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 503 }
    );
  }

  const results: { email: string; status: string }[] = [];
  const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existingUsers = listData.users;

  for (const account of getTestAccounts()) {
    const existing = existingUsers.find((u) => u.email === account.email);

    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
        user_metadata: {
          full_name: account.fullName,
          role: account.role,
        },
      });
      await admin
        .from("profiles")
        .update({
          full_name: account.fullName,
          role: account.role,
          is_platform_admin: Boolean(account.isPlatformAdmin),
        })
        .eq("id", existing.id);
      results.push({ email: account.email, status: "updated" });
      continue;
    }

    const { error } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: {
        full_name: account.fullName,
        role: account.role,
      },
    });

    results.push({
      email: account.email,
      status: error ? `error: ${error.message}` : "created",
    });
  }

  return NextResponse.json({ ok: true, results });
}
