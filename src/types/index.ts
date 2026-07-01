export type ActionResult<T = void> = {
  success: boolean;
  msg: string;
  data?: T;
};

export type Tienda = {
  id: string;
  nombre: string;
  excluida_actualizacion: number;
  created_at: string;
};

export type UserRow = {
  id: string;
  username: string;
  nombre: string;
  rol: "client" | "admin" | "administrador_general";
  tienda_id: string | null;
  tienda_nombre: string | null;
  activo: number;
  created_at: string;
};

export type Vendedor = {
  id: number;
  nombre: string;
  codigo: string;
  tienda_id: string;
  tienda_nombre: string;
  activo: number;
  created_at: string;
};

export type Module = {
  id: string;
  nombre: string;
  ruta: string;
  orden: number;
};
