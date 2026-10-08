"use server";

import { getSession } from "@/lib/auth";
import { transaction, type InStatement } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";
import { estadoGeneral, partesParaEnvio, partesParaSolicitud, siguienteEstado, type Estado } from "@/lib/traslados-reglas";

const clean = (s: string) => s.trim().toUpperCase();
const fail = (msg: string): ActionResult => ({ success: false, msg });

function refresh() {
  revalidatePath("/client/stock");
  revalidatePath("/client/traslados");
  revalidatePath("/admin/traslados");
}

async function actor(query: (s: InStatement) => Promise<{ rows: Record<string, unknown>[] }>, userId: string, credential: string) {
  const user = (await query({ sql: `SELECT u.id,u.nombre,u.tienda_id,t.nombre AS sede,t.tipo
    FROM users u JOIN tiendas t ON t.id=u.tienda_id WHERE u.id=? AND u.activo=1 AND u.rol='client'`, args: [userId] })).rows[0];
  if (!user) throw new Error("Perfil de sede no disponible");
  const seller = (await query({ sql: "SELECT id,codigo FROM vendedores WHERE codigo=? AND (tienda_id=? OR tienda_id IS NULL) AND activo=1", args: [clean(credential), user.tienda_id] })).rows[0];
  if (!seller) throw new Error("Credencial inválida para esta sede");
  return { user, seller };
}

async function crearMovimiento(barcodeRaw: string, destinoRaw: string, credencial: string, tipo: "solicitud" | "envio"): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.rol !== "client" || !session.tienda_id) return fail("Sin permisos");
  const barcode = clean(barcodeRaw), requestedDestination = clean(destinoRaw);
  if (!barcode || !credencial.trim()) return fail("Datos incompletos");
  try {
    await transaction(async (query) => {
      await query("SELECT pg_advisory_xact_lock(hashtext('inventario_traslados'))");
      const { user, seller } = await actor(query, session.id, credencial);
      if (tipo === "solicitud" && user.tipo !== "tienda") throw new Error("Las solicitudes se crean desde tiendas");
      if (tipo === "envio" && user.tipo !== "almacen") throw new Error("Solo un almacén puede iniciar envíos");
      const destino = tipo === "solicitud" ? String(user.sede) : requestedDestination;
      if (!destino || destino === user.sede && tipo === "envio") throw new Error("Destino inválido");
      if (tipo === "envio") {
        const site = (await query({ sql: "SELECT tipo FROM tiendas WHERE nombre=?", args: [destino] })).rows[0];
        if (site?.tipo !== "tienda") throw new Error("Los envíos de almacén deben ir a una tienda");
      }
      const item = (await query({ sql: "SELECT * FROM inventario_completo WHERE cod_barras=? FOR UPDATE", args: [barcode] })).rows[0];
      if (!item) throw new Error("Código de barras no encontrado");
      if (item.ocupado) throw new Error("El producto figura ocupado en el ERP");
      const partes = tipo === "solicitud"
        ? partesParaSolicitud(String(item.alm_izq), String(item.alm_der), destino)
        : partesParaEnvio(String(item.alm_izq), String(item.alm_der), String(user.sede));
      if (!partes.length) throw new Error(tipo === "solicitud" ? "El producto ya está completo en tu sede" : "Este almacén no tiene ningún lado del producto");
      const active = await query({ sql: "SELECT id FROM traslados WHERE cod_barras=? AND estado<>'recibido' LIMIT 1", args: [barcode] });
      if (active.rows.length) throw new Error("Ya hay una solicitud o envío activo para este código");
      const origen = [...new Set(partes.map((parte) => parte.origen))].join(" / ");
      const lado = partes.length === 2 ? "ambos" : partes[0].lado;
      const desc = [item.marca, item.modelo, item.talla].filter(Boolean).join(" ");
      const estado = tipo === "envio" ? "enviado" : "solicitado";
      const inserted = await query({ sql: `INSERT INTO traslados (cod_barras,cod_universal,descripcion,origen,destino,lado,tipo,estado)
        VALUES (?,?,?,?,?,?,?,?) RETURNING id`, args: [barcode, item.cod_universal, desc, origen, destino, lado, tipo, estado] });
      const id = inserted.rows[0].id;
      for (const parte of partes) {
        await query({ sql: `INSERT INTO traslado_partes (traslado_id,cod_barras,lado,origen,estado) VALUES (?,?,?,?,?)`,
          args: [id, barcode, parte.lado, parte.origen, estado] });
        await query({ sql: `INSERT INTO traslado_eventos (traslado_id,lado,estado,sede,user_id,usuario,credencial_id,credencial)
          VALUES (?,?,?,?,?,?,?,?)`, args: [id, parte.lado, estado, user.sede, session.id, user.nombre, seller.id, seller.codigo] });
      }
    });
    refresh();
    return { success: true, msg: tipo === "envio" ? "Envío registrado" : "Solicitud registrada" };
  } catch (e) {
    return fail(e instanceof Error && e.message.includes("idx_traslado_activo_barra") ? "Ya hay un traslado activo para este código" : String(e instanceof Error ? e.message : e));
  }
}

export async function solicitarProducto(barcode: string, credencial: string): Promise<ActionResult> {
  return crearMovimiento(barcode, "", credencial, "solicitud");
}

export async function enviarProducto(barcode: string, destino: string, credencial: string): Promise<ActionResult> {
  return crearMovimiento(barcode, destino, credencial, "envio");
}

export async function avanzarTraslado(id: number, lados: ("izq" | "der")[], credencial: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.rol !== "client" || !session.tienda_id || !Number.isSafeInteger(id) || !Array.isArray(lados) || !lados.length || lados.length > 2 || new Set(lados).size !== lados.length || lados.some((lado) => !["izq", "der"].includes(lado)) || !credencial.trim()) return fail("Datos incompletos");
  try {
    await transaction(async (query) => {
      await query("SELECT pg_advisory_xact_lock(hashtext('inventario_traslados'))");
      const { user, seller } = await actor(query, session.id, credencial);
      const row = (await query({ sql: "SELECT * FROM traslados WHERE id=? FOR UPDATE", args: [id] })).rows[0];
      if (!row) throw new Error("Traslado no encontrado");
      const parts = (await query({ sql: "SELECT * FROM traslado_partes WHERE traslado_id=? FOR UPDATE", args: [id] })).rows;
      for (const lado of lados) {
        const part = parts.find((candidate) => candidate.lado === lado);
        if (!part) throw new Error("Ese lado no forma parte del traslado");
        const next = siguienteEstado(part.estado as Estado, String(part.origen), String(row.destino), String(user.sede));
        if (!next) throw new Error("Esta sede no puede realizar el siguiente paso");
        if (next === "recibido") {
          const col = lado === "der" ? "alm_der" : "alm_izq";
          const changed = await query({ sql: `UPDATE inventario_completo SET ${col}=?,actualizado_at=now()
            WHERE cod_barras=? AND ${col}=?`, args: [row.destino, row.cod_barras, part.origen] });
          if (!changed.rowsAffected) throw new Error("El stock cambió desde la solicitud; revisa la carga antes de recepcionar");
        }
        await query({ sql: "UPDATE traslado_partes SET estado=?,actualizado_at=now() WHERE traslado_id=? AND lado=?", args: [next, id, lado] });
        await query({ sql: `INSERT INTO traslado_eventos (traslado_id,lado,estado,sede,user_id,usuario,credencial_id,credencial)
          VALUES (?,?,?,?,?,?,?,?)`, args: [id, lado, next, user.sede, session.id, user.nombre, seller.id, seller.codigo] });
      }
      const states = (await query({ sql: "SELECT estado FROM traslado_partes WHERE traslado_id=?", args: [id] })).rows.map((part) => part.estado as Estado);
      await query({ sql: "UPDATE traslados SET estado=?,actualizado_at=now() WHERE id=?", args: [estadoGeneral(states), id] });
    });
    refresh();
    return { success: true, msg: "Estado actualizado" };
  } catch (e) { return fail(e instanceof Error ? e.message : "Error al actualizar"); }
}

export async function marcarAtendido(id: number, checked: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !["admin", "administrador_general"].includes(session.rol) || !Number.isSafeInteger(id)) return fail("Sin permisos");
  try {
    await transaction(async (query) => {
      const current = await query({ sql: "SELECT 1 FROM users WHERE id=? AND activo=1 AND rol IN ('admin','administrador_general')", args: [session.id] });
      if (!current.rows.length) throw new Error("Sin permisos");
      const changed = await query({ sql: "UPDATE traslados SET atendido=?,actualizado_at=now() WHERE id=? AND estado='recibido' AND atendido<>? RETURNING id", args: [checked, id, checked] });
      if (!changed.rows.length) throw new Error("Solo puedes marcar un recibido que aún no tenga ese valor");
      await query({ sql: `INSERT INTO traslado_eventos (traslado_id,estado,user_id,usuario) VALUES (?,?,?,?)`, args: [id, checked ? "atendido" : "reabierto", session.id, session.nombre] });
    });
    refresh();
    return { success: true, msg: "Actualizado" };
  } catch (e) { return fail(e instanceof Error ? e.message : "Error al actualizar"); }
}
