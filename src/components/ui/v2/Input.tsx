import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label ? (
          <label htmlFor={id} className="block text-sm font-medium tracking-tight text-[#0F172A]">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={id}
          className={cn(
            "w-full rounded-[24px] border border-[#1677F2]/12 bg-white px-5 py-3.5",
            "text-base text-[#0F172A] placeholder:text-[#94A3B8]",
            "shadow-[0_4px_16px_rgba(15,23,42,0.04)]",
            "transition-all duration-200 ease-out",
            "focus:border-[#1677F2]/40 focus:outline-none focus:ring-4 focus:ring-[#1677F2]/12",
            error && "border-[#FF5A5F]/40 focus:border-[#FF5A5F] focus:ring-[#FF5A5F]/12",
            className
          )}
          {...props}
        />
        {hint && !error ? <p className="text-xs text-[#64748B]">{hint}</p> : null}
        {error ? <p className="text-sm text-[#FF5A5F]">{error}</p> : null}
      </div>
    );
  }
);

Input.displayName = "Input";
