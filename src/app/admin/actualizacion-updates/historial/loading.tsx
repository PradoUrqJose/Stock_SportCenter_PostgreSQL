import { Skeleton, ExpandableListSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-8 w-44 rounded-lg" />
      </div>
      <Skeleton className="mt-2.5 mb-6 h-4 w-56" />
      <ExpandableListSkeleton rows={8} />
    </div>
  );
}
