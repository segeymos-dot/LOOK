import { isDemoMode } from "@/lib/config";

export function DemoBanner() {
  if (!isDemoMode()) return null;

  return (
    <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
      Демо-режим — данные для примера. Supabase не подключён.
    </div>
  );
}
