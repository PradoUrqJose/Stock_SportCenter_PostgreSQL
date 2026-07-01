"use client";

import { useState, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { crearTienda, editarTienda, eliminarTienda, toggleLoteExclusion } from "@/lib/actions/tiendas";
import type { Tienda } from "@/types";

function TiendaCreateForm({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const r = await crearTienda(fd.get("nombre") as string);
    setLoading(false);
    if (!r.success) { setError(r.msg); return; }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-nombre">Nombre (ERP: mayúsculas, sin espacios)</Label>
        <Input id="c-nombre" name="nombre" placeholder="Ej: MIRAFLORES" required autoFocus />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loading ? "Creando…" : "Crear"}
        </Button>
      </div>
    </form>
  );
}

function TiendaEditForm({ tienda, onDone }: { tienda: Tienda; onDone: () => void }) {
  const [excluida, setExcluida] = useState(tienda.excluida_actualizacion === 1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const r = await editarTienda(tienda.id, fd.get("nombre") as string, excluida);
    setLoading(false);
    if (!r.success) { setError(r.msg); return; }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="e-nombre">Nombre</Label>
        <Input id="e-nombre" name="nombre" defaultValue={tienda.nombre} required />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="e-excluida"
          checked={excluida}
          onCheckedChange={(v) => setExcluida(v === true)}
        />
        <Label htmlFor="e-excluida">Excluir de publicaciones (permanente)</Label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loading ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

type Props = {
  tiendas: Tienda[];
  loteBorrador: { id: number } | null;
  exclusionesLote: string[];
};

function LoteExclusionToggle({
  tiendaId,
  loteId,
  initialExcluida,
}: {
  tiendaId: string;
  loteId: number;
  initialExcluida: boolean;
}) {
  const [optimisticExcluida, setOptimistic] = useOptimistic(initialExcluida);
  const [, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    startTransition(async () => {
      setOptimistic(checked);
      await toggleLoteExclusion(tiendaId, loteId, checked);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`lote-exc-${tiendaId}`}
        checked={optimisticExcluida}
        onCheckedChange={(v) => handleChange(v === true)}
      />
      <label
        htmlFor={`lote-exc-${tiendaId}`}
        className="cursor-pointer text-sm text-[#41454d] select-none"
      >
        {optimisticExcluida ? (
          <span className="text-red-600">Excluida del lote #{loteId}</span>
        ) : (
          <span className="text-[#41454d]">Incluida</span>
        )}
      </label>
    </div>
  );
}

export function TiendasTable({ tiendas, loteBorrador, exclusionesLote }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Tienda | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tienda | null>(null);
  const excluiSet = new Set(exclusionesLote);

  const showLoteCol = !!loteBorrador;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nueva Tienda
        </Button>
      </div>

      {showLoteCol && (
        <p className="mb-3 text-xs text-[#41454d]">
          Hay un borrador activo (lote #{loteBorrador!.id}). Puedes excluir tiendas de esta
          publicación — no recibirán confirmaciones al publicar.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-[#dddddd] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Exclusión permanente</TableHead>
              {showLoteCol && <TableHead>Lote en borrador</TableHead>}
              <TableHead>Creada</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiendas.length === 0 && (
              <TableRow>
                <TableCell colSpan={showLoteCol ? 5 : 4} className="py-8 text-center text-[#41454d]">
                  Sin tiendas registradas
                </TableCell>
              </TableRow>
            )}
            {tiendas.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium text-[#181d26]">{t.nombre}</TableCell>
                <TableCell>
                  {t.excluida_actualizacion ? (
                    <Badge variant="secondary">Excluida siempre</Badge>
                  ) : (
                    <Badge variant="outline">Activa</Badge>
                  )}
                </TableCell>
                {showLoteCol && (
                  <TableCell>
                    <LoteExclusionToggle
                      tiendaId={t.id}
                      loteId={loteBorrador!.id}
                      initialExcluida={excluiSet.has(t.id)}
                    />
                  </TableCell>
                )}
                <TableCell className="text-sm text-[#41454d]">
                  {t.created_at.slice(0, 10)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditTarget(t)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setDeleteTarget(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Tienda</DialogTitle>
          </DialogHeader>
          {createOpen && <TiendaCreateForm onDone={() => setCreateOpen(false)} />}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Tienda</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <TiendaEditForm tienda={editTarget} onDone={() => setEditTarget(null)} />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Eliminar la tienda "${deleteTarget?.nombre}"`}
        variant="destructive"
        description="Esta acción no se puede deshacer. Si la tienda tiene usuarios o vendedores vinculados, no podrá eliminarse."
        confirmLabel="Eliminar"
        onConfirm={() => eliminarTienda(deleteTarget!.id)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
