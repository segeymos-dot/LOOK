import { getFinanceApiUser } from "@/lib/api/finance-auth";
import { isPlatformAdmin } from "@/lib/data/finance-actions";
import {
  areProdSafeTestPaymentsEnabled,
  canMarkOrderAsTest,
} from "@/lib/payments/test-payments-guard";
import { NextResponse } from "next/server";

/** Client capability probe for TEST order checkbox (no secrets). */
export async function GET(request: Request) {
  const auth = await getFinanceApiUser(request);
  if ("error" in auth) {
    return NextResponse.json({
      success: true,
      can_mark_test: false,
      prod_safe_enabled: areProdSafeTestPaymentsEnabled(),
    });
  }

  const admin = await isPlatformAdmin(auth.supabase, auth.user.id);
  return NextResponse.json({
    success: true,
    can_mark_test: canMarkOrderAsTest({
      email: auth.user.email,
      isPlatformAdmin: admin,
    }),
    prod_safe_enabled: areProdSafeTestPaymentsEnabled(),
  });
}
