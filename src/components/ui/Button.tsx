import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const variants = {
  primary:
    "gradient-brand text-white shadow-sm hover:opacity-95 active:opacity-90",
  secondary:
    "bg-slate-100 text-text-primary hover:bg-slate-200 active:bg-slate-300",
  ghost: "bg-transparent text-text-secondary hover:bg-slate-100 hover:text-text-primary",
  danger: "bg-danger text-white hover:bg-red-600 active:bg-red-700",
  outline:
    "border border-border bg-surface text-text-primary hover:border-brand-300 hover:bg-brand-50",
};

const sizes = {
  sm: "h-9 px-3.5 text-sm rounded-xl",
  md: "h-11 px-5 text-base rounded-xl",
  lg: "h-13 px-6 text-lg rounded-2xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-semibold transition-all",
          "disabled:pointer-events-none disabled:opacity-50",
          "active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Загрузка...</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
