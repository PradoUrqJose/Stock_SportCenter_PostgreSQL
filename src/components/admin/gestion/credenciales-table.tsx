"use client";

import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { crearVendedor, editarVendedor, eliminarVendedor } from "@/lib/actions/credenciales";
import type { Tienda, Vendedor } from "@/types";

type VendedorFormData = {
  nombre: string;
  codigo: string;
  tienda_id: string;
  activo: boolean;
};

function VendedorForm({
  initial,
  tiendas,
  isEdit,
  onDone,
}: {
  initial?: Vendedor;
  tiendas: Tienda[];
  isEdit: boolean;
  onDone: () => void;
}) {
  const [form, setForm] = useState<VendedorFormData>({
    nombre: initial?.nombre ?? "",
    codigo: initial?.codigo ?? "",
    tienda_id: initial?.tienda_id ?? "",
    activo: initial ? initial.activo === 1 : true,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set<K extends keyof VendedorFormData>(k: K, v: VendedorFormData[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const r = isEdit && initial
      ? await editarVendedor(initial.id, form)
      : await crearVendedor(form);

    setLoading(false);
    if (!r.success) { setError(r.msg); return; }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-nombre">Nombre vendedor</Label>
          <Input
            id="v-nombre"
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Juan López"
            required
            autoFocus={!isEdit}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-codigo">Código de confirmación</Label>
          <Input
            id="v-codigo"
            value={form.codigo}
            onChange={(e) => set("codigo", e.target.value.toUpperCase())}
            placeholder="Ej: VEN01"
            required
            className="font-mono"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Tienda <span className="text-red-500">*</span></Label>
        <Select value={form.tienda_id} onValueChange={(v) => set("tienda_id", v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Seleccionar tienda…" />
          </SelectTrigger>
          <SelectContent>
            {tiendas.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isEdit && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="v-activo"
            checked={form.activo}
            onCheckedChange={(v) => set("activo", v === true)}
          />
          <Label htmlFor="v-activo">Vendedor activo</Label>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loading ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}

export function CredencialesTable({
  vendedores,
  tiendas,
}: {
  vendedores: Vendedor[];
  tiendas: Tienda[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vendedor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vendedor | null>(null);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nueva Credencial
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#dddddd] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tienda</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendedores.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-[#41454d]">
                  Sin vendedores registrados
                </TableCell>
              </TableRow>
            )}
            {vendedores.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono font-medium text-[#181d26]">{v.codigo}</TableCell>
                <TableCell>{v.nombre}</TableCell>
                <TableCell className="text-sm text-[#41454d]">{v.tienda_nombre}</TableCell>
                <TableCell>
                  {v.activo ? (
                    <Badge variant="outline">Activo</Badge>
                  ) : (
                    <Badge variant="secondary">Inactivo</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditTarget(v)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setDeleteTarget(v)}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Credencial</DialogTitle>
          </DialogHeader>
          {createOpen && (
            <VendedorForm
              tiendas={tiendas}
              isEdit={false}
              onDone={() => setCreateOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Credencial</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <VendedorForm
              key={editTarget.id}
              initial={editTarget}
              tiendas={tiendas}
              isEdit
              onDone={() => setEditTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Eliminar el vendedor "${deleteTarget?.nombre}" (${deleteTarget?.codigo})`}
        variant="destructive"
        description="Esta acción no se puede deshacer. El código de confirmación dejará de ser válido para esta tienda."
        confirmLabel="Eliminar"
        onConfirm={() => eliminarVendedor(deleteTarget!.id)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
