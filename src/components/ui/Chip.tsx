import { cn } from "@/lib/utils";

interface ChipProps {
  children: React.ReactNode;
  variant?: "default" | "brand" | "muted";
  className?: string;
}

const variants = {
  default: "bg-brand-50 text-brand-700",
  brand: "gradient-brand text-white",
  muted: "bg-slate-100 text-text-secondary",
};

export function Chip({ children, variant = "default", className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
