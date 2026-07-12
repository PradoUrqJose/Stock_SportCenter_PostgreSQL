"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sincronizarErp } from "@/lib/actions/sincronizar";

// Trae Facturación e Ingresos nuevos del ERP en un solo llamado (la función
// Python de api/sincronizar.py scrapea ambos). Vive en las páginas de ambos
// módulos porque el botón siempre sincroniza los dos juntos.
export function SincronizarButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const res = await sincronizarErp();
      if (!res.success) {
        alert(`Error al sincronizar: ${res.msg}`);
        return;
      }
      alert(res.msg);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Sincronizar
    </Button>
  );
}
