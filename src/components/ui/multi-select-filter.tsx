"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Combobox,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";

export type MultiSelectFilterProps = {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  formatOption?: (value: string) => string;
};

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  formatOption,
}: MultiSelectFilterProps) {
  return (
    <Combobox
      items={options}
      multiple
      value={selected}
      onValueChange={onChange}
      itemToStringLabel={formatOption}
    >
      <ComboboxPrimitive.Trigger
        className={cn(
          "flex h-8 w-40 shrink-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted"
        )}
      >
        <span className="truncate text-left">
          {selected.length > 0 ? `${label} · ${selected.length}` : label}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </ComboboxPrimitive.Trigger>

      <ComboboxContent>
        <div className="p-1 pb-0">
          <ComboboxPrimitive.Input
            render={<Input placeholder={`Buscar ${label.toLowerCase()}…`} />}
          />
        </div>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {formatOption ? formatOption(item) : item}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>Sin resultados</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
