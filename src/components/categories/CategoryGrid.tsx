import Link from "next/link";
import type { Category } from "@/types";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Camera,
  Code,
  Hammer,
  Heart,
  Palette,
  Scale,
  Truck,
  type LucideIcon,
} from "lucide-react";

interface CategoryGridProps {
  categories: Category[];
  selectedId?: string;
}

const iconMap: Record<string, LucideIcon> = {
  hammer: Hammer,
  code: Code,
  palette: Palette,
  book: BookOpen,
  heart: Heart,
  truck: Truck,
  camera: Camera,
  scale: Scale,
};

export function CategoryGrid({ categories, selectedId }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {categories.map((category) => {
        const Icon = (category.icon && iconMap[category.icon]) || Hammer;
        const isSelected = selectedId === category.id;

        return (
          <Link
            key={category.id}
            href={`/search?category=${category.slug}`}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all",
              isSelected
                ? "border-brand-500 bg-brand-50 shadow-card"
                : "border-border-subtle bg-surface shadow-card hover:border-brand-200 hover:shadow-elevated"
            )}
          >
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl",
                isSelected ? "gradient-brand text-white" : "bg-brand-50 text-brand-600"
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-text-primary">{category.name}</p>
          </Link>
        );
      })}
    </div>
  );
}
