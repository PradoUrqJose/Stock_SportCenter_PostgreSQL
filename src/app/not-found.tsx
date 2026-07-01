import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-foreground">Página no encontrada</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          El recurso que buscás no existe o fue movido.
        </p>
        <Button render={<Link href="/" />}>Ir al inicio</Button>
      </div>
    </div>
  );
}
