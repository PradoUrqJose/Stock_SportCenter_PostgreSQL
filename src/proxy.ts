import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "session-token";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

// Dominio de los catálogos para clientes (catalogos.sportcenterpe.com; en local
// catalogos.localhost:3000). Es el MISMO despliegue que el sistema, así que este
// host solo puede mostrar catálogos: cualquier otra ruta (/admin, /login, /api…)
// responde 404 sin llegar a ella. La cookie de sesión es host-only, de modo que
// tampoco viaja a este host.
const HOST_CATALOGOS = /^catalogos\./i;
const SLUG = /^\/([A-Za-z0-9_-]{8,64})\/?$/;

function responderCatalogos(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const cabeceras = { "X-Robots-Tag": "noindex, nofollow" };

  // Recursos del propio framework que necesita la página (JS, fuentes, HMR en desarrollo).
  if (pathname.startsWith("/_next/")) return NextResponse.next();

  const m = SLUG.exec(pathname);
  if (m) {
    const url = req.nextUrl.clone();
    url.pathname = `/c/${m[1]}`;
    const res = NextResponse.rewrite(url);
    res.headers.set("X-Robots-Tag", cabeceras["X-Robots-Tag"]);
    return res;
  }
  return new NextResponse("No encontrado", { status: 404, headers: cabeceras });
}

export async function proxy(req: NextRequest) {
  if (HOST_CATALOGOS.test(req.headers.get("host") ?? "")) return responderCatalogos(req);

  const { pathname } = req.nextUrl;
  const isAdmin = pathname.startsWith("/admin");
  const isClient = pathname.startsWith("/client");
  const isLogin = pathname === "/login";

  // El matcher cubre todas las rutas (para poder mirar el host): lo que no es
  // del área protegida sigue de largo sin verificar el token.
  if (!isAdmin && !isClient && !isLogin) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
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
  // Todo menos los estáticos de Next: hace falta ver el host de cada petición.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
