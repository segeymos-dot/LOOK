import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { PortfolioItem } from "@/types";
import { ExternalLink } from "lucide-react";

interface PortfolioGalleryProps {
  items: PortfolioItem[];
  title?: string;
  variant?: "default" | "public";
}

export function PortfolioGallery({
  items,
  title = "Портфолио",
  variant = "default",
}: PortfolioGalleryProps) {
  if (!items?.length) {
    if (variant === "public") {
      return (
        <section className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight text-text-primary">{title}</h2>
          <Card padding="md" className="text-center">
            <p className="text-sm text-text-muted">Портфолио пока пустое</p>
          </Card>
        </section>
      );
    }
    return null;
  }

  if (variant === "public") {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight text-text-primary">{title}</h2>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {items.map((item, index) => (
            <Card
              key={item.id}
              padding="none"
              className="w-[min(85vw,320px)] shrink-0 snap-start overflow-hidden"
            >
              {item.image_url && (
                <div className="relative aspect-[4/3] w-full bg-slate-100">
                  <Image
                    src={item.image_url}
                    alt={item.title}
                    fill
                    className="object-cover"
                    unoptimized={
                      item.image_url.startsWith("data:") || item.image_url.startsWith("blob:")
                    }
                  />
                </div>
              )}
              <div className="p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-text-primary">{item.title}</h3>
                  {item.link && (
                    <Link
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-brand-600"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                </div>
                {item.description && (
                  <p className="line-clamp-3 text-sm leading-relaxed text-text-secondary">
                    {item.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-text-muted">Проект {index + 1}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold tracking-tight text-text-primary">{title}</h2>
      <div className="space-y-4">
        {items.map((item, index) => (
          <Card key={item.id} padding="none" className="overflow-hidden">
            {item.image_url && (
              <div className="relative aspect-[16/10] w-full bg-slate-100">
                <Image
                  src={item.image_url}
                  alt={item.title}
                  fill
                  className="object-cover"
                  unoptimized={item.image_url.startsWith("data:") || item.image_url.startsWith("blob:")}
                />
              </div>
            )}
            <div className="p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="font-semibold text-text-primary">
                  Проект №{index + 1}: {item.title}
                </h3>
                {item.link && (
                  <Link
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-brand-600"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                )}
              </div>
              {item.description && (
                <p className="text-sm leading-relaxed text-text-secondary">{item.description}</p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
