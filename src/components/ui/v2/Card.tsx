import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "soft";
  padding?: "none" | "sm" | "md" | "lg";
}

const variants = {
  default: "border border-[#1677F2]/10 bg-white shadow-[0_8px_32px_rgba(15,23,42,0.06)]",
  elevated: "border border-white/80 bg-white shadow-[0_16px_48px_rgba(22,119,242,0.12)]",
  soft: "border border-[#EEF5FF] bg-[#F8FBFF] shadow-[0_4px_20px_rgba(22,119,242,0.08)]",
};

const paddings = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", padding = "md", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[24px] transition-shadow duration-200 ease-out",
          variants[variant],
          paddings[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
