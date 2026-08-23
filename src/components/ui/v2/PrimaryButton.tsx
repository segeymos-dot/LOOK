"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
}

const sizes = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-5 text-base",
  lg: "h-14 px-6 text-lg",
};

export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  ({ className, size = "md", loading, disabled, fullWidth, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[24px] font-semibold tracking-tight",
          "bg-[#1677F2] text-white",
          "shadow-[0_8px_24px_rgba(22,119,242,0.28)]",
          "transition-all duration-200 ease-out",
          "hover:bg-[#1264D9] hover:shadow-[0_10px_28px_rgba(22,119,242,0.32)]",
          "active:scale-[0.98] active:shadow-[0_4px_16px_rgba(22,119,242,0.24)]",
          "disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677F2]/30 focus-visible:ring-offset-2",
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

PrimaryButton.displayName = "PrimaryButton";
