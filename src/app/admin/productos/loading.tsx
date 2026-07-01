import { PageHeaderSkeleton, FilterBarSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-4 md:p-8">
      <PageHeaderSkeleton />
      <FilterBarSkeleton filters={3} />
      <TableSkeleton rows={10} cols={9} />
    </div>
  );
}
