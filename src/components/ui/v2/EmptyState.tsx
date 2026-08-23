import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[24px] border border-dashed border-[#1677F2]/18",
        "bg-[#F8FBFF] px-6 py-12 text-center",
        "shadow-[0_8px_32px_rgba(15,23,42,0.04)]",
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] bg-white shadow-[0_8px_24px_rgba(22,119,242,0.12)]">
        <Icon className="h-7 w-7 text-[#1677F2]" aria-hidden="true" />
      </div>
      <p className="text-lg font-semibold tracking-tight text-[#0F172A]">{title}</p>
      {description ? (
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#64748B]">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
