"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toggleModulo } from "@/lib/actions/permisos";
import type { Module, UserRow } from "@/types";

type GrantSet = Set<string>; // `${userId}:${moduleId}`

export function PermisosTable({
  admins,
  modules,
  grants,
}: {
  admins: UserRow[];
  modules: Module[];
  grants: GrantSet;
}) {
  const [optimistic, setOptimistic] = useState<GrantSet>(new Set(grants));

  function key(userId: string, moduleId: string) {
    return `${userId}:${moduleId}`;
  }

  async function handleToggle(userId: string, moduleId: string, checked: boolean) {
    const k = key(userId, moduleId);
    setOptimistic((prev) => {
      const next = new Set(prev);
      checked ? next.add(k) : next.delete(k);
      return next;
    });

    const r = await toggleModulo(userId, moduleId, checked);
    if (!r.success) {
      setOptimistic((prev) => {
        const next = new Set(prev);
        checked ? next.delete(k) : next.add(k);
        return next;
      });
      window.alert(r.msg);
    }
  }

  if (admins.length === 0) {
    return (
      <div className="rounded-lg border border-[#dddddd] bg-white p-8 text-center text-sm text-[#41454d]">
        No hay usuarios con rol Admin. Créalos en la sección Usuarios.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#dddddd] bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">Usuario</TableHead>
            {modules.map((m) => (
              <TableHead key={m.id} className="text-center">
                <div className="flex justify-center">
                  <span className="text-xs">{m.nombre}</span>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {admins.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <p className="font-medium text-[#181d26]">{u.nombre}</p>
                <p className="font-mono text-xs text-[#41454d]">{u.username}</p>
              </TableCell>
              {modules.map((m) => (
                <TableCell key={m.id} className="text-center">
                  <div className="flex justify-center">
                    <Checkbox
                      checked={optimistic.has(key(u.id, m.id))}
                      onCheckedChange={(v) => handleToggle(u.id, m.id, v === true)}
                      aria-label={`${m.nombre} para ${u.username}`}
                    />
                  </div>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
