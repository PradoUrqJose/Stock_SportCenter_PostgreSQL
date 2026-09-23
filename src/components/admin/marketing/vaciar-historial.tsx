"use client";

// Vacía el historial de generaciones y sincronizaciones (no toca ningún catálogo). Con el uso normal se llena
// rápido, porque cada «Generar» o «Sincronizar» deja una fila aunque solo se mire y no se aplique nada.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { vaciarHistorial } from "@/lib/actions/marketing-catalogos";

export function VaciarHistorial() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setAbierto(true)}>
        <Trash2 data-icon="inline-start" /> Vaciar historial
      </Button>
      <ConfirmDialog
        open={abierto}
        onOpenChange={setAbierto}
        title="Vaciar el historial"
        description="Se borran todas las filas de generaciones y sincronizaciones. No se toca ningún catálogo ni sus versiones publicadas. No se puede deshacer."
        confirmLabel="Vaciar historial"
        variant="destructive"
        onConfirm={() => vaciarHistorial()}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
