import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "outline" | "ghost";
  padding?: "none" | "sm" | "md" | "lg";
}

const variants = {
  default: "bg-surface shadow-card border border-border-subtle",
  elevated: "bg-surface shadow-elevated border border-border-subtle",
  outline: "bg-surface border border-border",
  ghost: "bg-transparent",
};

const paddings = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", padding = "md", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("rounded-2xl", variants[variant], paddings[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
