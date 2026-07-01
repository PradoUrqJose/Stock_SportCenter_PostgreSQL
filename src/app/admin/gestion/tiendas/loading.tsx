import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} cols={4} />
    </div>
  );
}
