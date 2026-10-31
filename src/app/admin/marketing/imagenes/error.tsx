"use client";

import { Button } from "@/components/ui/button";

export default function ErrorImagenes({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-border p-5 text-sm">
      <p className="font-medium">No se pudo comprobar el inventario de imágenes.</p>
      <p className="text-muted-foreground">No hay una comprobación completa de R2 y su registro. Vuelve a intentarlo para ver los resultados actuales.</p>
      <Button size="sm" variant="outline" onClick={unstable_retry}>Volver a comprobar</Button>
    </div>
  );
}
