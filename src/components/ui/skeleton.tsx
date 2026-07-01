import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-gray-200", className)}
      {...props}
    />
  );
}

/** Deterministic "random" width so skeleton rows look organic without hydration mismatches. */
function rowWidth(seed: number) {
  return `${55 + ((seed * 37) % 40)}%`;
}

function PageHeaderSkeleton({ withSubtitle = true }: { withSubtitle?: boolean }) {
  return (
    <div className="mb-6">
      <Skeleton className="h-6 w-52" />
      {withSubtitle && <Skeleton className="mt-2.5 h-4 w-72" />}
    </div>
  );
}

function FilterBarSkeleton({ filters = 2 }: { filters?: number }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-2">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-64 rounded-md" />
        {Array.from({ length: filters }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="h-10 px-2 align-middle">
                <Skeleton className="h-3.5 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-border last:border-0">
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="p-2 align-middle">
                  <Skeleton className="h-4" style={{ width: rowWidth(r * cols + c + 1) }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card px-5 py-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function ExpandableListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <Skeleton className="h-4" style={{ width: rowWidth(i + 1) }} />
          <Skeleton className="ml-auto h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export {
  Skeleton,
  PageHeaderSkeleton,
  FilterBarSkeleton,
  TableSkeleton,
  CardGridSkeleton,
  ExpandableListSkeleton,
};
