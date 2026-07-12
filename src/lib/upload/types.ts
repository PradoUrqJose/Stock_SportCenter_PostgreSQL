export type ProductoInsert = {
  cod_universal: string;
  genero: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  grupo: string | null;
  color: string | null;
  precio_lista: number;
  descuento: number;
  stock_total: number;
};

export type VarianteInsert = {
  cod_barras: string;
  cod_universal: string;
  genero: string;
  talla: string | null;
  alm_izq: string | null;
  alm_der: string | null;
  cod_prod: string | null;
  precio_compra: number | null;
  ingreso_fecha: string | null;
};

export type ImagenInsert = {
  cod_universal: string;
  imagen_url: string;
};

export type BuildResult = {
  productos: ProductoInsert[];
  variantes: VarianteInsert[];
  imagenes: ImagenInsert[];
};

export type VentaInsert = {
  cod_barras: string; // serial por unidad → clave de dedup
  cod_universal: string | null;
  genero: string | null;
  fecha_venta: string; // ISO YYYY-MM-DD
  ingreso_fecha: string | null; // derivada del barcode
  almacen: string | null;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  grupo: string | null;
  color: string | null;
  talla: string | null;
  precio_compra: number | null;
  precio_lista: number | null;
  importe: number | null;
};

export type FacturacionInsert = {
  ser_num: string; // clave de dedup, ej. "FJ01-4340"
  codigo: string | null;
  tienda: string | null;
  tipo_comprobante: string | null;
  cliente: string | null;
  mayorista: string | null;
  fecha: string; // ISO YYYY-MM-DD
  moneda: string | null;
  subtotal: number | null;
  dscto: number | null;
  not_cre: number | null;
  bi: number | null;
  igv: number | null;
  total: number;
  efectivo: number | null;
  tarjeta: number | null;
  transferencia: number | null;
  detalle_tarjeta: string | null;
  vendedor: string | null;
  nc: string | null;
  fuente: "historico" | "erp";
};

export type IngresoInsert = {
  codigo_interno: string; // clave de dedup, ej. "C001538"
  emp: string | null;
  almacen: string | null;
  ing_sal: string | null;
  tipo_mov: string | null;
  serie_numero: string | null;
  emision: string; // ISO YYYY-MM-DD
  moneda: string | null;
  importe: number | null;
  subtotal: number | null;
  igv: number | null;
  dscto: number | null;
  total: number | null;
  ruc: string | null;
  proveedor: string | null;
  cmpl: string | null;
  mcdr: string | null;
  ord_compra: string | null;
  fuente: "historico" | "erp";
};
