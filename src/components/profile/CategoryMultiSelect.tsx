import { cn } from "@/lib/utils";
import type { Category } from "@/types";
import { Check } from "lucide-react";

interface CategoryMultiSelectProps {
  categories: Category[];
  selected: string[];
  onChange: (slugs: string[]) => void;
  label?: string;
}

export function CategoryMultiSelect({
  categories,
  selected,
  onChange,
  label = "Категории",
}: CategoryMultiSelectProps) {
  const toggle = (slug: string) => {
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else {
      onChange([...selected, slug]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text-primary">{label}</label>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const isSelected = selected.includes(cat.slug);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => toggle(cat.slug)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                isSelected
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-border bg-surface text-text-secondary hover:border-brand-200"
              )}
            >
              {isSelected && <Check className="h-3.5 w-3.5" />}
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
