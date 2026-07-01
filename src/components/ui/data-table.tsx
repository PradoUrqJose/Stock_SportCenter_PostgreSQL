"use client";

import { useState, useEffect } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Column definition ────────────────────────────────────────────────────────

export type ColDef<T> = {
  key: string;
  header: React.ReactNode;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  // return a primitive for comparison; omit when sortable=false
  sortValue?: (row: T) => string | number | null | undefined;
  cell: (row: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  // relative proportion of the table width (e.g. 1.5 = 1.5x a column of width 1).
  // when set on any column, all columns size by this ratio instead of by content width.
  width?: number;
};

// ─── Props ────────────────────────────────────────────────────────────────────

type SortState = { key: string; dir: "asc" | "desc" };

export type DataTableProps<T> = {
  columns: ColDef<T>[];
  data: T[];
  keyFn: (row: T) => string;
  emptyTitle?: string;
  emptyDesc?: string;
  defaultSort?: SortState;
  pageSize?: number;
};

// ─── URL helpers (no navigation, no refetch) ──────────────────────────────────

function urlParams() {
  return new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
}

function readSort(defaultSort?: SortState): SortState | undefined {
  const p = urlParams();
  const key = p.get("sort");
  const dir = p.get("dir") as "asc" | "desc" | null;
  if (key && dir) return { key, dir };
  return defaultSort;
}

function readPage(): number {
  return Math.max(1, parseInt(urlParams().get("page") ?? "1", 10));
}

function syncUrl(sort: SortState | undefined, page: number) {
  const p = urlParams();
  if (sort) {
    p.set("sort", sort.key);
    p.set("dir", sort.dir);
  } else {
    p.delete("sort");
    p.delete("dir");
  }
  if (page > 1) p.set("page", String(page));
  else p.delete("page");
  window.history.replaceState(null, "", p.size ? `?${p}` : location.pathname);
}

// ─── Sort logic ───────────────────────────────────────────────────────────────

function sortData<T>(data: T[], sort: SortState | undefined, cols: ColDef<T>[]): T[] {
  if (!sort) return data;
  const col = cols.find((c) => c.key === sort.key);
  if (!col?.sortValue) return data;
  return [...data].sort((a, b) => {
    const va = col.sortValue!(a) ?? "";
    const vb = col.sortValue!(b) ?? "";
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

// ─── Alignment helper ─────────────────────────────────────────────────────────

function alignCls(align?: ColDef<unknown>["align"]) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  keyFn,
  emptyTitle = "Sin datos",
  emptyDesc,
  defaultSort,
  pageSize = 50,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | undefined>(defaultSort);
  const [page, setPage] = useState(1);
  const [hydrated, setHydrated] = useState(false);

  const sorted = sortData(data, sort, columns);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasWidths = columns.some((c) => c.width != null);
  const totalWidth = columns.reduce((sum, c) => sum + (c.width ?? 1), 0);

  // Read the real URL only after mount so the first client render matches the SSR output.
  useEffect(() => {
    setSort(readSort(defaultSort));
    setPage(readPage());
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    syncUrl(sort, safePage);
  }, [sort, safePage, hydrated]);

  function toggleSort(col: ColDef<T>) {
    if (!col.sortable) return;
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: "asc" }
    );
    setPage(1);
  }

  const SortIcon = ({ col }: { col: ColDef<T> }) => {
    if (!col.sortable) return null;
    if (sort?.key !== col.key)
      return <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-300" />;
    return sort.dir === "asc"
      ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-blue-500" />
      : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-blue-500" />;
  };

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-[#dddddd] bg-white">
        <Table style={hasWidths ? { tableLayout: "fixed" } : undefined}>
          {hasWidths && (
            <colgroup>
              {columns.map((col) => (
                <col
                  key={col.key}
                  style={{ width: `${((col.width ?? 1) / totalWidth) * 100}%` }}
                />
              ))}
            </colgroup>
          )}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  onClick={() => toggleSort(col)}
                  className={cn(
                    alignCls(col.align),
                    hasWidths && "truncate",
                    col.sortable && "cursor-pointer select-none hover:bg-gray-50 transition-colors",
                    col.headerClassName
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    <SortIcon col={col} />
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="py-16 text-center">
                  <p className="font-medium text-[#41454d]">{emptyTitle}</p>
                  {emptyDesc && (
                    <p className="mt-1 text-xs text-gray-400">{emptyDesc}</p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                <TableRow
                  key={keyFn(row)}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 duration-150"
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(alignCls(col.align), hasWidths && "truncate", col.cellClassName)}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 text-sm text-gray-500">
          <span>
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)}{" "}
            de {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="w-20 text-center">
              {safePage} / {totalPages}
            </span>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
