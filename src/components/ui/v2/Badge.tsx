import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "neutral";
  size?: "sm" | "md";
}

const variants = {
  default: "bg-[#EEF5FF] text-[#1264D9] ring-[#1677F2]/15",
  success: "bg-[#E8FAF3] text-[#0D9488] ring-[#16C784]/15",
  warning: "bg-[#FFF8E8] text-[#B45309] ring-[#F5B942]/20",
  danger: "bg-[#FFECEC] text-[#DC2626] ring-[#FF5A5F]/15",
  neutral: "bg-[#F1F5F9] text-[#475569] ring-[#CBD5E1]/40",
};

const sizes = {
  sm: "px-2.5 py-0.5 text-[11px]",
  md: "px-3 py-1 text-xs",
};

export function Badge({
  className,
  variant = "default",
  size = "md",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold tracking-tight ring-1 ring-inset",
        "transition-colors duration-200 ease-out",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
