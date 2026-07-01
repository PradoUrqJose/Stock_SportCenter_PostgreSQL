import { Skeleton, PageHeaderSkeleton, FilterBarSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4 md:p-8">
      <PageHeaderSkeleton withSubtitle={false} />
      <Skeleton className="mb-6 h-4 w-80" />
      <FilterBarSkeleton filters={4} />
      <TableSkeleton rows={10} cols={10} />
    </div>
  );
}
