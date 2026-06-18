import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  className?: string;
}

const sizes = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function StarRating({
  rating,
  max = 5,
  size = "md",
  showValue = false,
  className,
}: StarRatingProps) {
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <div className="flex">
        {Array.from({ length: max }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              sizes[size],
              i < Math.round(rating)
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-200 text-slate-200"
            )}
          />
        ))}
      </div>
      {showValue && rating > 0 && (
        <span className="text-sm font-semibold text-text-primary">{rating.toFixed(1)}</span>
      )}
    </div>
  );
}

interface StarPickerProps {
  value: number;
  onChange: (value: number) => void;
}

export function StarPicker({ value, onChange }: StarPickerProps) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const star = i + 1;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="rounded-lg p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                "h-7 w-7",
                star <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
