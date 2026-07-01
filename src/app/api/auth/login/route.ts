import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, signToken, seedAdmin, type SessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!rateLimit(ip, 10, 60_000)) {
    return NextResponse.json(
      { success: false, msg: "Demasiados intentos. Espera un momento." },
      { status: 429 }
    );
  }

  try {
    await seedAdmin();

    const body = await req.json();
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { success: false, msg: "Datos incompletos" },
        { status: 400 }
      );
    }

    const result = await db.execute({
      sql: "SELECT id, username, password, nombre, rol, tienda_id, activo FROM users WHERE username = ?",
      args: [username],
    });

    const row = result.rows[0];
    if (!row || !row.activo) {
      return NextResponse.json(
        { success: false, msg: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, row.password as string);
    if (!valid) {
      return NextResponse.json(
        { success: false, msg: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const user: SessionUser = {
      id: row.id as string,
      username: row.username as string,
      nombre: row.nombre as string,
      rol: row.rol as SessionUser["rol"],
      tienda_id: (row.tienda_id as string | null) ?? null,
    };

    const token = await signToken(user);
    const redirectTo = user.rol === "client" ? "/client/actualizacion" : "/admin";

    const res = NextResponse.json({ success: true, msg: "OK", redirect: redirectTo });
    res.cookies.set("session-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return res;
  } catch (e) {
    console.error("[login]", e);
    return NextResponse.json(
      { success: false, msg: "Error interno" },
      { status: 500 }
    );
  }
}
