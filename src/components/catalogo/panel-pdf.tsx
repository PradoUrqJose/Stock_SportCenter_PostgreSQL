"use client";

// Ventana para descargar el catálogo en PDF: todo, una marca o un rango de páginas. El PDF se arma en
// este dispositivo (no se sube nada) y se descarga solo al terminar. Se carga solo al pulsar el botón.
// Es un modal simple con los colores del visor (no usa el Dialog del sistema: aquí no hay tema claro/oscuro).
// Se pinta en el <body> (portal): el encabezado tiene `backdrop-blur`, y eso haría que un elemento `fixed` se
// ubique respecto del encabezado y no de la pantalla (la ventana salía pegada arriba y cortada en el celular).
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";
import {
  PdfCancelado,
  descargarBlob,
  estimarMb,
  generarPdf,
  marcasDelCatalogo,
  nombreArchivoPdf,
  type EntradaPdf,
} from "@/lib/marketing-pdf";

type Modo = "todo" | "marca" | "rango";
const TRAMO = 200;

const ENTRADA =
  "h-9 w-24 rounded-md border border-[#2a2d35] bg-[#16181d] px-2 text-sm text-[#e8e8e8] outline-none focus-visible:border-[#2f6fed]";

export default function PanelPdf({ entrada, alCerrar }: { entrada: EntradaPdf; alCerrar: () => void }) {
  const total = entrada.paginas.length;
  const marcas = useMemo(() => marcasDelCatalogo(entrada), [entrada]);
  const [modo, setModo] = useState<Modo>("todo");
  const [marca, setMarca] = useState(marcas[0]?.marca ?? "");
  const [desde, setDesde] = useState(1);
  const [hasta, setHasta] = useState(Math.min(total, TRAMO));
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; detalle?: string } | null>(null);
  const control = useRef<AbortController | null>(null);
  const trabajando = avance !== null;

  // Índices (0-based) de las páginas elegidas.
  const indices = useMemo(() => {
    if (modo === "marca") return marcas.find((m) => m.marca === marca)?.indices ?? [];
    const d = modo === "rango" ? Math.max(1, Math.min(desde, total)) : 1;
    const h = modo === "rango" ? Math.max(d, Math.min(hasta, total)) : total;
    return Array.from({ length: h - d + 1 }, (_, k) => d - 1 + k);
  }, [modo, marca, desde, hasta, total, marcas]);
  const mb = estimarMb(entrada, indices);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && !control.current && alCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alCerrar]);
  // Al cerrar la ventana con un PDF en marcha, se cancela.
  useEffect(() => () => control.current?.abort(), []);

  async function generar() {
    const c = new AbortController();
    control.current = c;
    setResultado(null);
    setAvance({ hechas: 0, total: indices.length });
    const t0 = performance.now();
    try {
      const { pdf, sinImagen } = await generarPdf(entrada, indices, {
        senal: c.signal,
        alProgreso: (hechas, tot) => setAvance({ hechas, total: tot }),
      });
      const detalle = modo === "marca" ? marca : modo === "rango" ? `p${desde}-${hasta}` : undefined;
      descargarBlob(pdf, nombreArchivoPdf(entrada.titulo, detalle));
      const seg = (performance.now() - t0) / 1000;
      setResultado({
        ok: true,
        texto: `Listo: ${(pdf.size / 1e6).toFixed(1)} MB en ${seg.toFixed(0)} s. Se descargó en tu dispositivo.`,
        detalle: sinImagen.length ? `${sinImagen.length} página(s) salieron sin la imagen del producto (no existe en el servidor): ${sinImagen.slice(0, 12).join(", ")}${sinImagen.length > 12 ? "…" : ""}` : undefined,
      });
    } catch (e) {
      setResultado(
        e instanceof PdfCancelado || c.signal.aborted
          ? { ok: false, texto: "Cancelado." }
          : { ok: false, texto: "No se pudo armar el PDF. Revisa tu conexión e inténtalo otra vez, o prueba con menos páginas.", detalle: e instanceof Error ? e.message : String(e) }
      );
      if (!(e instanceof PdfCancelado)) console.error(e);
    } finally {
      control.current = null;
      setAvance(null);
    }
  }

  const tramos = Array.from({ length: Math.ceil(total / TRAMO) }, (_, k) => [k * TRAMO + 1, Math.min(total, (k + 1) * TRAMO)] as const);
  const opcion = (id: Modo, texto: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="radio" name="modo-pdf" className="accent-[#2f6fed]" checked={modo === id} disabled={trabajando} onChange={() => setModo(id)} />
      {texto}
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 font-sans font-normal sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && !trabajando && alCerrar()}>
      <div role="dialog" aria-modal="true" aria-label="Descargar PDF" className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-[#2a2d35] bg-[#0e0f12] p-4 text-[#e8e8e8] shadow-xl sm:max-w-md sm:rounded-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Descargar PDF</h2>
            <p className="text-xs text-[#9aa0ab]">Se arma en tu dispositivo; no se sube nada.</p>
          </div>
          <button type="button" aria-label="Cerrar" className="rounded p-1 text-[#9aa0ab] hover:text-white disabled:opacity-40" onClick={alCerrar} disabled={trabajando}>
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          {opcion("todo", `Todo el catálogo (${total.toLocaleString("en-US")} páginas)`)}
          {marcas.length > 1 && opcion("marca", "Una marca")}
          {modo === "marca" && (
            <select className={`${ENTRADA} w-full`} value={marca} disabled={trabajando} onChange={(e) => setMarca(e.target.value)}>
              {marcas.map((m) => (
                <option key={m.marca} value={m.marca}>
                  {m.marca} ({m.indices.length})
                </option>
              ))}
            </select>
          )}
          {total > TRAMO && opcion("rango", "Un rango de páginas")}
          {modo === "rango" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                Desde
                <input type="number" min={1} max={total} className={ENTRADA} value={desde} disabled={trabajando} onChange={(e) => setDesde(Number(e.target.value) || 1)} />
                hasta
                <input type="number" min={1} max={total} className={ENTRADA} value={hasta} disabled={trabajando} onChange={(e) => setHasta(Number(e.target.value) || 1)} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tramos.map(([d, h]) => (
                  <button
                    key={d}
                    type="button"
                    disabled={trabajando}
                    onClick={() => {
                      setDesde(d);
                      setHasta(h);
                    }}
                    className={`rounded-full border px-2 py-0.5 text-xs ${d === desde && h === hasta ? "border-[#2f6fed] text-white" : "border-[#2a2d35] text-[#9aa0ab] hover:text-white"}`}
                  >
                    {d}–{h}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-[#9aa0ab]">
          {indices.length.toLocaleString("en-US")} página(s) · peso aproximado {mb < 1 ? "menos de 1" : Math.round(mb)} MB
          {indices.length > 300 && " · es un archivo grande: en el celular conviene bajarlo por marca o por tramos"}
        </p>

        {avance && (
          <div className="mt-3 space-y-1.5" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-[#2a2d35]">
              <div className="h-full bg-[#2f6fed] transition-[width]" style={{ width: `${(avance.hechas / Math.max(1, avance.total)) * 100}%` }} />
            </div>
            <p className="text-xs text-[#9aa0ab]">
              Armando página {avance.hechas.toLocaleString("en-US")} de {avance.total.toLocaleString("en-US")}… no cierres esta pestaña
            </p>
          </div>
        )}
        {resultado && (
          <div className="mt-3 space-y-1">
            <p className={`text-sm ${resultado.ok ? "text-emerald-400" : "text-red-400"}`}>{resultado.texto}</p>
            {resultado.detalle && <p className={`break-words text-xs ${resultado.ok ? "text-amber-300" : "text-[#9aa0ab]"}`}>{resultado.ok ? "" : "Detalle: "}{resultado.detalle}</p>}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {trabajando ? (
            <button type="button" className="h-9 rounded-md border border-[#2a2d35] px-3 text-sm hover:bg-white/5" onClick={() => control.current?.abort()}>
              Cancelar
            </button>
          ) : (
            <>
              <button type="button" className="h-9 rounded-md border border-[#2a2d35] px-3 text-sm hover:bg-white/5" onClick={alCerrar}>
                Cerrar
              </button>
              <button type="button" disabled={indices.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#2f6fed] px-3 text-sm font-medium text-white disabled:opacity-50" onClick={() => void generar()}>
                <Download className="size-4" /> Generar PDF
              </button>
            </>
          )}
          {trabajando && <Loader2 className="size-4 animate-spin self-center text-[#9aa0ab]" aria-hidden />}
        </div>
      </div>
    </div>,
    document.body
  );
}
