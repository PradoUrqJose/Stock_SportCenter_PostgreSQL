"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-foreground">Algo salió mal</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Ocurrió un error inesperado. Podés intentar de nuevo o volver al inicio.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => unstable_retry()}>
            Reintentar
          </Button>
          <Button render={<Link href="/" />}>Ir al inicio</Button>
        </div>
      </div>
    </div>
  );
}
