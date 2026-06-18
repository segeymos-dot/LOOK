import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%]",
        className
      )}
    />
  );
}

export function RequestCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <Skeleton className="h-5 w-3/4 rounded-lg" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mb-3 h-4 w-full rounded-lg" />
      <Skeleton className="mb-3 h-4 w-2/3 rounded-lg" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-4 w-16 rounded-lg" />
      </div>
    </div>
  );
}
