import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface FinanceStatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "brand" | "success" | "warning";
}

const accents = {
  brand: "text-brand-600 bg-brand-50",
  success: "text-emerald-700 bg-success-bg",
  warning: "text-amber-700 bg-warning-bg",
};

export function FinanceStatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "brand",
}: FinanceStatCardProps) {
  return (
    <Card padding="md" className="relative overflow-hidden">
      <div className={cn("mb-3 inline-flex rounded-xl p-2.5", accents[accent])}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold tracking-tight text-text-primary">{value}</p>
      <p className="mt-1 text-sm font-medium text-text-secondary">{label}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </Card>
  );
}
