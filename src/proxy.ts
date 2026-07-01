import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "session-token";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_NAME)?.value;

  const isAdmin = pathname.startsWith("/admin");
  const isClient = pathname.startsWith("/client");
  const isLogin = pathname === "/login";

  let session: { rol: string } | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      session = payload as { rol: string };
    } catch {
      // token inválido o expirado — tratamos como no autenticado
    }
  }

  // Rutas protegidas sin sesión → login
  if ((isAdmin || isClient) && !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Rol incorrecto → sección propia
  if (isAdmin && session?.rol === "client") {
    return NextResponse.redirect(new URL("/client/actualizacion", req.url));
  }
  if (isClient && session && session.rol !== "client") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // Ya autenticado intenta entrar a login → sección propia
  if (isLogin && session) {
    const dest = session.rol === "client" ? "/client/actualizacion" : "/admin";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/client/:path*", "/login"],
};
