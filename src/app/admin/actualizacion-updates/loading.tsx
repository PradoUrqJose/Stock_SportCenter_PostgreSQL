import { Skeleton, CardGridSkeleton, FilterBarSkeleton, ExpandableListSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-8 w-44 rounded-lg" />
      </div>
      <CardGridSkeleton count={4} />
      <FilterBarSkeleton filters={3} />
      <ExpandableListSkeleton rows={6} />
    </div>
  );
}
