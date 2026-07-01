"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
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
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center bg-muted/50 p-6 antialiased">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-foreground">Error crítico</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            La aplicación no pudo cargar correctamente.
          </p>
          <button
            onClick={() => unstable_retry()}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
