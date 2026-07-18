"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";

export type SelectFilterDef<T> = {
  key: string;
  label: string;
  // for fields with a single value per row
  getValue?: (row: T) => string | null | undefined;
  // for fields with multiple values per row (e.g. a product sold in several tiendas) —
  // a row matches the filter when any of its values is selected
  getValues?: (row: T) => (string | null | undefined)[];
  formatOption?: (value: string) => string;
};

export type FilterBarProps<T> = {
  data: T[];
  filters: SelectFilterDef<T>[];
  getSearchText: (row: T) => string;
  searchPlaceholder?: string;
  // extra controls rendered in the same row as the filters, pushed to the right
  actions?: React.ReactNode;
  children: (filtered: T[]) => React.ReactNode;
  // notifies the parent whenever the filtered set changes, so it can render
  // things (e.g. summary cards) outside/above this component using the same filtered data
  onFilteredChange?: (filtered: T[]) => void;
};

export function FilterBar<T>({ data, filters, getSearchText, searchPlaceholder = "Buscar…", actions, children, onFilteredChange }: FilterBarProps<T>) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const options = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of filters) {
      const set = new Set<string>();
      for (const row of data) {
        if (f.getValues) {
          for (const v of f.getValues(row)) if (v) set.add(v);
        } else if (f.getValue) {
          const v = f.getValue(row);
          if (v) set.add(v);
        }
      }
      map[f.key] = [...set].sort((a, b) => a.localeCompare(b));
    }
    return map;
  }, [data, filters]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.filter((row) => {
      if (term && !getSearchText(row).toLowerCase().includes(term)) return false;
      for (const f of filters) {
        const sel = selected[f.key];
        if (sel && sel.length > 0) {
          if (f.getValues) {
            const values = f.getValues(row);
            if (!values.some((v) => v && sel.includes(v))) return false;
          } else if (f.getValue) {
            const value = f.getValue(row);
            if (!value || !sel.includes(value)) return false;
          }
        }
      }
      return true;
    });
  }, [data, search, selected, filters, getSearchText]);

  const hasActiveFilters = search.trim() !== "" || Object.values(selected).some((v) => v.length > 0);

  useEffect(() => {
    onFilteredChange?.(filtered);
  }, [filtered, onFilteredChange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} className="pl-8" />
          </div>

          {filters.map((f) => (
            <MultiSelectFilter
              key={f.key}
              label={f.label}
              options={options[f.key]}
              selected={selected[f.key] ?? []}
              onChange={(values) => setSelected((s) => ({ ...s, [f.key]: values }))}
              formatOption={f.formatOption}
            />
          ))}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelected({});
              }}
            >
              <X className="h-3.5 w-3.5" />
              Limpiar filtros
            </Button>
          )}
        </div>

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {children(filtered)}
    </div>
  );
}
