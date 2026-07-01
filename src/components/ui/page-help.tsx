"use client";

import { useState } from "react";
import { Info, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type HelpItem = { term: string; desc: string };

/**
 * Banner de ayuda para la fila del encabezado de una página. Colapsado muestra solo el
 * disparador; al abrir despliega una explicación de cada dato de la página activa —
 * pensado para usuarios nuevos que aún no interpretan las métricas.
 */
export function PageHelp({ items, intro }: { items: HelpItem[]; intro?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-800 dark:text-blue-300 transition-colors hover:bg-blue-100"
      >
        <Info className="h-3.5 w-3.5" />
        ¿Cómo leer esta página?
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[90vw] rounded-xl border border-blue-100 dark:border-blue-500/20 bg-card p-4 shadow-lg">
            {intro && <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{intro}</p>}
            <ul className="space-y-2.5">
              {items.map((it) => (
                <li key={it.term} className="text-xs leading-relaxed">
                  <span className="font-semibold text-foreground">{it.term}</span>
                  <span className="text-muted-foreground"> — {it.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
