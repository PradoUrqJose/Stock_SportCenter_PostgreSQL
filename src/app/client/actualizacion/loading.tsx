import { Skeleton, FilterBarSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-8 w-64 rounded-lg" />
      </div>
      <FilterBarSkeleton filters={3} />
      <TableSkeleton rows={8} cols={9} />
    </div>
  );
}
