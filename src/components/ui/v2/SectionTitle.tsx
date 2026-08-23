import { HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionTitleProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  align?: "left" | "center";
}

export function SectionTitle({
  title,
  subtitle,
  action,
  align = "left",
  className,
  ...props
}: SectionTitleProps) {
  return (
    <div
      className={cn(
        "flex gap-3",
        align === "center" ? "flex-col items-center text-center" : "items-end justify-between",
        className
      )}
      {...props}
    >
      <div className={cn("min-w-0", align === "center" && "w-full")}>
        <h2 className="text-xl font-bold tracking-tight text-[#0F172A]">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm leading-relaxed text-[#64748B]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
