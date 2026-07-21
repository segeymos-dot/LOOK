"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
}

const sizes = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-5 text-base",
  lg: "h-14 px-6 text-lg",
};

export const SecondaryButton = forwardRef<HTMLButtonElement, SecondaryButtonProps>(
  ({ className, size = "md", loading, disabled, fullWidth, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[24px] font-semibold tracking-tight",
          "border border-[#1677F2]/20 bg-white text-[#1264D9]",
          "shadow-[0_4px_16px_rgba(15,23,42,0.06)]",
          "transition-all duration-200 ease-out",
          "hover:border-[#1677F2]/35 hover:bg-[#EEF5FF] hover:shadow-[0_6px_20px_rgba(22,119,242,0.12)]",
          "active:scale-[0.98]",
          "disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677F2]/25 focus-visible:ring-offset-2",
          fullWidth && "w-full",
          sizes[size],
          className
        )}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  }
);

SecondaryButton.displayName = "SecondaryButton";
