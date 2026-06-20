import { isDemoMode } from "@/lib/config";

export function BetaBanner() {
  if (isDemoMode()) return null;

  return (
    <div className="bg-amber-50 px-4 py-2 text-center text-xs leading-relaxed text-amber-900 sm:text-sm">
      <span className="font-semibold">BETA VERSION.</span>
      <br />
      Все платежи тестовые.
      <br />
      Реальные деньги не списываются.
    </div>
  );
}
