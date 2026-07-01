import { PageHeaderSkeleton, FilterBarSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4 md:p-8">
      <PageHeaderSkeleton />
      <FilterBarSkeleton filters={4} />
      <TableSkeleton rows={10} cols={10} />
    </div>
  );
}
