import { Skeleton } from "@/components/ui/Skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-surface-muted p-4">
      <div className="flex flex-col items-center gap-3 py-8">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-6 w-40 rounded-lg" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    </div>
  );
}
