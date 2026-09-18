import { Skeleton } from "@/components/ui/Skeleton";

export default function ProfilePaymentsLoading() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg space-y-4 bg-surface-muted p-4">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-4 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
