import { Skeleton } from "@/components/ui/Skeleton";

/** Chat shell while the client bundle + thread hydrate. */
export default function ChatDetailLoading() {
  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-surface-muted">
      <div className="flex items-center gap-3 border-b border-border-subtle bg-surface px-4 py-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32 rounded-lg" />
          <Skeleton className="h-3 w-24 rounded-lg" />
        </div>
      </div>
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="ml-auto h-12 w-2/3 rounded-2xl" />
        <Skeleton className="h-12 w-1/2 rounded-2xl" />
        <Skeleton className="ml-auto h-16 w-3/4 rounded-2xl" />
        <Skeleton className="h-10 w-2/5 rounded-2xl" />
      </div>
      <div className="border-t border-border-subtle p-3">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}
