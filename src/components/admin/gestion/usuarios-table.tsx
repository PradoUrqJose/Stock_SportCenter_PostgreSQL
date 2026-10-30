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
import { crearUsuario, editarUsuario, eliminarUsuario } from "@/lib/actions/usuarios";
import type { Tienda, UserRow } from "@/types";

const ROL_LABEL: Record<string, string> = {
  client: "Cliente",
  admin: "Admin",
  administrador_general: "Admin General",
};

type UserFormData = {
  username: string;
  nombre: string;
  password: string;
  rol: "client" | "admin";
  tienda_id: string;
  activo: boolean;
};

function UserForm({
  initial,
  tiendas,
  isEdit,
  onDone,
}: {
  initial?: UserRow;
  tiendas: Tienda[];
  isEdit: boolean;
  onDone: () => void;
}) {
  const [form, setForm] = useState<UserFormData>({
    username: initial?.username ?? "",
    nombre: initial?.nombre ?? "",
    password: "",
    rol: (initial?.rol as "client" | "admin") ?? "client",
    tienda_id: initial?.tienda_id ?? "",
    activo: initial ? initial.activo === 1 : true,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set<K extends keyof UserFormData>(k: K, v: UserFormData[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      ...form,
      tienda_id: form.tienda_id || null,
    };

    const r = isEdit && initial
      ? await editarUsuario(initial.id, { ...payload, activo: form.activo })
      : await crearUsuario(payload);

    setLoading(false);
    if (!r.success) { setError(r.msg); return; }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="u-username">Usuario</Label>
          <Input
            id="u-username"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            placeholder="jlopez"
            required
            autoFocus={!isEdit}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="u-nombre">Nombre completo</Label>
          <Input
            id="u-nombre"
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Juan López"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="u-password">
          {isEdit ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
        </Label>
        <Input
          id="u-password"
          type="password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          placeholder={isEdit ? "••••••••" : "Min. 6 caracteres"}
          required={!isEdit}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Rol</Label>
          <Select
            value={form.rol}
            onValueChange={(v) => {
              set("rol", (v ?? "client") as "client" | "admin");
              if (v === "admin") set("tienda_id", "");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client">Cliente</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Tienda {form.rol === "client" && <span className="text-red-500">*</span>}</Label>
          <Select
            value={form.tienda_id}
            onValueChange={(v) => set("tienda_id", v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar…" />
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
      </div>

      {isEdit && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="u-activo"
            checked={form.activo}
            onCheckedChange={(v) => set("activo", v === true)}
          />
          <Label htmlFor="u-activo">Usuario activo</Label>
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

export function UsuariosTable({
  usuarios,
  tiendas,
}: {
  usuarios: UserRow[];
  tiendas: Tienda[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo Usuario
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Tienda</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Sin usuarios registrados
                </TableCell>
              </TableRow>
            )}
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-sm text-foreground">{u.username}</TableCell>
                <TableCell>{u.nombre}</TableCell>
                <TableCell>
                  <Badge variant={u.rol === "administrador_general" ? "default" : "secondary"}>
                    {ROL_LABEL[u.rol] ?? u.rol}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {u.tienda_nombre ?? "—"}
                </TableCell>
                <TableCell>
                  {u.activo ? (
                    <Badge variant="outline">Activo</Badge>
                  ) : (
                    <Badge variant="secondary">Inactivo</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {u.rol !== "administrador_general" && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditTarget(u)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Usuario</DialogTitle>
          </DialogHeader>
          {createOpen && (
            <UserForm
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
            <DialogTitle>Editar Usuario</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <UserForm
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
        title={`Eliminar el usuario "${deleteTarget?.username}"`}
        variant="destructive"
        description="Esta acción no se puede deshacer. El usuario perderá acceso inmediatamente."
        confirmLabel="Eliminar"
        onConfirm={() => eliminarUsuario(deleteTarget!.id)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
