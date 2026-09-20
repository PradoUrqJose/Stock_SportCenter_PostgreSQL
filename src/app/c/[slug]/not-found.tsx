// 404 del enlace público: sin enlaces ni pistas hacia el resto del sistema.
export default function CatalogoNoDisponible() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#16181d] px-6 text-center text-[#e8e8e8]">
      <h1 className="text-lg font-semibold">Catálogo no disponible</h1>
      <p className="text-sm text-[#9aa0ab]">El enlace no es válido o el catálogo ya no está publicado.</p>
    </div>
  );
}
