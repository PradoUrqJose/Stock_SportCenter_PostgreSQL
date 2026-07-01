import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-8">
      <PageHeaderSkeleton />
      <Skeleton className="mb-4 h-9 w-64 rounded-lg" />
      <div className="space-y-4 rounded-xl border bg-white p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full max-w-md rounded-md" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="mt-4 h-8 w-32 rounded-md" />
    </div>
  );
}
