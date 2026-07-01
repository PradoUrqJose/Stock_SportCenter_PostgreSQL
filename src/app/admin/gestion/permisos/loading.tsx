import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} cols={7} />
    </div>
  );
}
