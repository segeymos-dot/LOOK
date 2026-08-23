import type { UserRole } from "@/types";
import { canActAsCustomer, canActAsProvider } from "@/lib/auth/roles";
import type { TransactionViewerScope } from "@/lib/finance/ledger";

export type ResolveTransactionScopeInput = {
  requestedScope: string | null;
  isAdmin: boolean;
  role: UserRole | null | undefined;
};

/**
 * Resolve the transaction list scope for the authenticated user.
 * Non-admins cannot request platform/admin scopes.
 * Provider balance pages should pass requestedScope=provider.
 */
export function resolveTransactionViewerScope(
  input: ResolveTransactionScopeInput
):
  | { ok: true; scope: TransactionViewerScope; viewer: TransactionViewerScope }
  | { ok: false; status: number; error: string } {
  const requested = (input.requestedScope ?? "auto").toLowerCase();
  const provider = canActAsProvider(input.role);
  const customer = canActAsCustomer(input.role);

  if (requested === "admin" || requested === "platform") {
    if (!input.isAdmin) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    const scope = requested === "platform" ? "platform" : "admin";
    return { ok: true, scope, viewer: scope === "platform" ? "platform" : "admin" };
  }

  if (requested === "provider") {
    if (!provider && !input.isAdmin) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: true, scope: "provider", viewer: "provider" };
  }

  if (requested === "customer") {
    if (!customer && !input.isAdmin) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: true, scope: "customer", viewer: "customer" };
  }

  if (requested === "party") {
    if (!provider && !customer && !input.isAdmin) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: true, scope: "party", viewer: "party" };
  }

  // auto
  if (input.isAdmin) {
    return { ok: true, scope: "admin", viewer: "admin" };
  }
  if (provider && customer) {
    return { ok: true, scope: "party", viewer: "party" };
  }
  if (provider) {
    return { ok: true, scope: "provider", viewer: "provider" };
  }
  if (customer) {
    return { ok: true, scope: "customer", viewer: "customer" };
  }
  return { ok: false, status: 403, error: "Forbidden" };
}
