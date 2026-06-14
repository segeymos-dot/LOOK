import Link from "next/link";
import type { Category } from "@/types";
import { cn } from "@/lib/utils";

interface CategoryGridProps {
  categories: Category[];
  selectedId?: string;
}

export function CategoryGrid({ categories, selectedId }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/search?category=${category.slug}`}
          className={cn(
            "rounded-2xl border p-4 text-center transition-colors",
            selectedId === category.id
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-100 bg-white hover:border-indigo-200"
          )}
        >
          <p className="font-medium text-gray-900">{category.name}</p>
        </Link>
      ))}
    </div>
  );
}
