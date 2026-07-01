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
