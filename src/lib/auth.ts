import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const COOKIE_NAME = "session-token";

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(s);
}

export type SessionUser = {
  id: string;
  username: string;
  nombre: string;
  rol: "client" | "admin" | "administrador_general";
  tienda_id: string | null;
};

// --- Passwords ---

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// --- JWT ---

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

// --- Session ---

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireRole(
  ...roles: SessionUser["rol"][]
): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!roles.includes(session.rol)) {
    redirect(session.rol === "client" ? "/client/actualizacion" : "/admin");
  }
  return session;
}

export async function requireModule(
  session: SessionUser,
  moduleId: string
): Promise<void> {
  // administrador_general bypasses module gating always
  if (session.rol === "administrador_general") return;
  const result = await db.execute({
    sql: "SELECT 1 FROM admin_modules WHERE user_id = ? AND module_id = ?",
    args: [session.id, moduleId],
  });
  if (result.rows.length === 0) redirect("/admin");
}

export function isAdminRole(rol: SessionUser["rol"]): boolean {
  return rol === "admin" || rol === "administrador_general";
}

// --- Seed administrador_general ---

export async function seedAdmin(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE rol = 'administrador_general' LIMIT 1",
    args: [],
  });
  if (existing.rows.length > 0) return;

  const id = crypto.randomUUID();
  const hashed = await hashPassword(password);
  await db.execute({
    sql: `INSERT INTO users (id, username, password, nombre, rol)
          VALUES (?, ?, ?, 'Administrador General', 'administrador_general')
          ON CONFLICT DO NOTHING`,
    args: [id, username, hashed],
  });
}
