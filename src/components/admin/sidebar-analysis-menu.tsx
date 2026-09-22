"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronDown, LayoutDashboard, PackageCheck, ScanSearch } from "lucide-react";

const ENTRADAS = [
  { href: "/admin/analisis", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/analisis/unicos", label: "Únicos", icon: ScanSearch },
  { href: "/admin/analisis/reponer", label: "Reponer", icon: PackageCheck },
  { href: "/admin/analisis/comisiones", label: "Comisiones", icon: ScanSearch },
];

export function SidebarAnalysisMenu() {
  const pathname = usePathname();
  const activo = pathname === "/admin/analisis" || pathname.startsWith("/admin/analisis/");
  const [abierto, setAbierto] = useState(activo);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        className={[
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
          activo ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white",
        ].join(" ")}
        aria-expanded={abierto}
      >
        <BarChart3 className="h-4 w-4 shrink-0" />
        <span className="flex-1">Análisis</span>
        <ChevronDown
          className={[
            "h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
            abierto ? "rotate-0" : "-rotate-90",
          ].join(" ")}
        />
      </button>
      <div
        className={[
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div
            className={[
              "mt-0.5 space-y-0.5 pl-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
              abierto ? "translate-y-0" : "-translate-y-1",
            ].join(" ")}
          >
            {ENTRADAS.map(({ href, label, icon: Icon }) => {
              const seleccionado = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    seleccionado ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5 hover:text-white",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
