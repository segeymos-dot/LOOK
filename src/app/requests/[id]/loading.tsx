import { Skeleton } from "@/components/ui/Skeleton";

/** Instant shell while the force-dynamic order detail RSC resolves. */
export default function RequestDetailLoading() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-surface-muted">
      <div className="border-b border-border-subtle bg-surface px-4 py-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <div className="space-y-4 p-4">
        <Skeleton className="h-7 w-3/4 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </div>
  );
}
