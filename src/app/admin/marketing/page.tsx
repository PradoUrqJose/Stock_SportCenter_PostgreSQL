import Link from "next/link";
import { Images, LayoutTemplate } from "lucide-react";
import { requireMarketing } from "@/lib/marketing";

export default async function MarketingPage() {
  await requireMarketing();

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Marketing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Imágenes de producto y catálogos para clientes.
        </p>
      </div>

      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <Link
          href="/admin/marketing/imagenes"
          className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
        >
          <Images className="h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">Imágenes</p>
          <p className="mt-1 text-xs text-muted-foreground">Ver y buscar las imágenes de producto guardadas en R2.</p>
        </Link>

        <div className="rounded-lg border border-dashed border-border p-4 opacity-60">
          <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">Catálogos</p>
          <p className="mt-1 text-xs text-muted-foreground">Próximamente.</p>
        </div>
      </div>
    </div>
  );
}
