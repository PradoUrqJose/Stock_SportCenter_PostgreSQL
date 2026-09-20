// Siembra los DISEÑOS reales de Marketing para el módulo de catálogos:
//   - las plantillas por marca (PLANTILLA <MARCA> FINAL): fondo WebP (web) y JPEG (PDF)
//     en R2 + fila en mk_plantillas con las zonas de código, tallas, precio y zapatilla;
//   - la biblioteca de páginas fijas (portadas, separadores, términos…): WebP de hasta
//     2000 px y miniatura en R2 + fila en mk_paginas_fijas.
//
// Idempotente: las rutas llevan un resumen del contenido (si el diseño cambia, cambia la
// ruta y no queda nada viejo en caché) y las filas se actualizan por id.
// Requiere R2_* y DATABASE_URL en .env.local y las migraciones 007 y 010.
//
// Uso (desde la raíz de STOCK_SC):
//   node --env-file=.env.local scripts/marketing-sembrar-disenos.mjs [carpeta]
//   (por defecto ~/Downloads/Disenios)
//
// Reversión: DELETE FROM mk_plantillas WHERE id IN ('adidas','nike','puma','reebok','skechers');
//            DROP TABLE mk_paginas_fijas;  y borrar plantillas/ y paginas-fijas/ del bucket.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AwsClient } from "aws4fetch";
import pg from "pg";
import sharp from "sharp";

const carpeta = process.argv[2] ?? join(homedir(), "Downloads", "Disenios");

const aws = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});
const base = `${process.env.R2_ENDPOINT.replace(/\/+$/, "")}/${process.env.R2_BUCKET}`;

async function subir(clave, cuerpo, tipo) {
  const res = await aws.fetch(`${base}/${clave}`, {
    method: "PUT",
    body: cuerpo,
    headers: {
      "Content-Type": tipo,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(cuerpo.byteLength),
    },
  });
  if (!res.ok) throw new Error(`R2 PUT ${clave} falló (${res.status})`);
  console.log(`R2 ✔ ${clave} (${(cuerpo.byteLength / 1024).toFixed(0)} KB)`);
}

const resumen = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);

// ---------- plantillas por marca ----------
// Medidas sobre los diseños (4000×2250 reducidos a 2000×1125). Las cuatro marcas comparten la
// composición; en Skechers la barra del código es más ancha. Colores: azul del diseño y blanco.
const AZUL = "#0143bb";
const zonas = (anchoCodigo) => ({
  codigo: { x: 360, y: 163, w: anchoCodigo, h: 75, color: "#ffffff", max: 46 },
  tallas: { x: 108, y: 488, w: 450, h: 162, color: AZUL, max: 54 },
  precio: { x: 108, y: 816, w: 450, h: 170, color: AZUL, max: 84 },
  zapatilla: { x: 820, y: 168, w: 1000, h: 1000 },
});
const PLANTILLAS = [
  { id: "adidas", marca: "ADIDAS", nombre: "Adidas", archivo: "PLANTILLA ADIDAS FINAL.jpg.jpeg", codigo: 204 },
  { id: "nike", marca: "NIKE", nombre: "Nike", archivo: "PLANTILLA NIKE FINAL.jpg.jpeg", codigo: 204 },
  { id: "puma", marca: "PUMA", nombre: "Puma", archivo: "PLANTILLA PUMA FINAL.jpg.jpeg", codigo: 204 },
  { id: "reebok", marca: "REEBOK", nombre: "Reebok", archivo: "PLANTILLA REEBOK FINAL.jpg.jpeg", codigo: 204 },
  { id: "skechers", marca: "SKECHERS", nombre: "Skechers", archivo: "PLANTILLA SKECHERS FINAL.jpg.jpeg", codigo: 278 },
];

// ---------- páginas fijas ----------
// auto: [tipo de catálogo o '*', 'inicio' | 'final'] = la generación la pone sola.
const FIJAS = [
  { id: "portada-hombres", nombre: "Portada Hombres", tipo: "portada", archivo: "PORTADA CATALOGO HOMBRES.jpg.jpeg" , auto: ["hombre,futbol", "inicio"] },
  { id: "portada-mujeres", nombre: "Portada Mujeres", tipo: "portada", archivo: "PORTADA CATALOGO MUJERES FINAL.jpg.jpeg" , auto: ["mujer", "inicio"] },
  { id: "portada-ninos", nombre: "Portada Niños", tipo: "portada", archivo: "PORTADA CATALOGO NIÑOS.jpg.jpeg" , auto: ["ninos", "inicio"] },
  { id: "portada-accesorios", nombre: "Portada Accesorios", tipo: "portada", archivo: "PORTADA CATALOGO ACCESORIOS_.jpg.jpeg" , auto: ["accesorios", "inicio"] },
  { id: "portada-sandalias", nombre: "Portada Sandalias", tipo: "portada", archivo: "PORTADA CATALOGO SANDALIAS.jpg.jpeg" , auto: ["sandalias", "inicio"] },
  { id: "portada-ropa", nombre: "Portada Ropa", tipo: "portada", archivo: "PORTADA ROPA.jpg.jpeg" , auto: ["ropa", "inicio"] },
  { id: "portada-ropa-hombre", nombre: "Portada Ropa Hombre", tipo: "portada", archivo: "PORTADA CATALOGO ROPA HOMBRE.jpg.jpeg" , auto: ["ropa-hombre", "inicio"] },
  { id: "portada-ropa-mujer", nombre: "Portada Ropa Mujer", tipo: "portada", archivo: "PORTADA CATALOGO ROPA MUJER.jpg.jpeg" , auto: ["ropa-mujer", "inicio"] },
  { id: "separador-grass-natural", nombre: "Fútbol · Grass natural", tipo: "separador", archivo: "SEPARADOR CATALOGO FUTBOL GRASS NATURAL.jpg.jpeg", auto: ["futbol", null] },
  { id: "separador-grass-sintetico-marcas", nombre: "Fútbol · Grass sintético (con marcas)", tipo: "separador", archivo: "SEPARADOR CATALOGO FUTBOL GRASS SINTETICO.jpg.jpeg", auto: ["futbol", null] },
  { id: "separador-grass-sintetico", nombre: "Fútbol · Grass sintético (sin marcas)", tipo: "separador", archivo: "SEPARADOR CATALOGO FUTBOL GRASS SINTÉTICO.jpg.jpeg", auto: ["futbol", null] },
  { id: "separador-losa-deportiva", nombre: "Fútbol · Losa deportiva", tipo: "separador", archivo: "SEPARADOR CATALOGO FUTBOL LOSA DEPORTIVA.jpg.jpeg", auto: ["futbol", null] },
  { id: "cierre-terminos", nombre: "Términos y condiciones", tipo: "cierre", archivo: "ULTIMO TERMINOS Y CONDICIONES FINAL.jpg.jpeg", auto: ["*", "final"] },
  { id: "zapatillas-ropa-original", nombre: "Zapatillas y ropa original", tipo: "otra", archivo: "ZAPATILLAS Y ROPA ORIGINAL.jpg.jpeg" },
];

// Bloque de contacto impreso abajo a la izquierda en las portadas (TikTok, WhatsApp, Facebook, Instagram), medido sobre el
// diseño en fracciones de 0 a 1 de la imagen. Las portadas de Ropa Hombre y Ropa Mujer tienen otra composición: sin zonas.
const ZONAS_CONTACTO = JSON.stringify([
  { tipo: "tiktok", x: 0.027, y: 0.843, w: 0.222, h: 0.075 },
  { tipo: "whatsapp", x: 0.027, y: 0.92, w: 0.165, h: 0.068 },
  { tipo: "facebook", x: 0.254, y: 0.845, w: 0.183, h: 0.072 },
  { tipo: "instagram", x: 0.254, y: 0.92, w: 0.22, h: 0.068 },
]);
const PORTADAS_CON_CONTACTO = ["portada-hombres", "portada-mujeres", "portada-ninos", "portada-accesorios", "portada-sandalias", "portada-ropa"];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const p of PLANTILLAS) {
    const original = readFileSync(join(carpeta, p.archivo));
    const clave = `plantillas/${p.marca.toLowerCase()}/${p.id}-${resumen(original)}`;
    const ancho = 2000;
    const alto = 1125;
    const fondo = sharp(original).resize(ancho, alto);
    await subir(`${clave}.webp`, await fondo.clone().webp({ quality: 84, effort: 5 }).toBuffer(), "image/webp");
    await subir(`${clave}.jpg`, await fondo.clone().jpeg({ quality: 88, mozjpeg: true }).toBuffer(), "image/jpeg");
    await client.query(
      `INSERT INTO mk_plantillas (id, marca, nombre, ancho, alto, fondo_key, zonas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET marca = excluded.marca, nombre = excluded.nombre, ancho = excluded.ancho,
         alto = excluded.alto, fondo_key = excluded.fondo_key, zonas = excluded.zonas, activa = 1`,
      [p.id, p.marca, p.nombre, ancho, alto, clave, JSON.stringify(zonas(p.codigo))]
    );
    console.log(`Neon ✔ mk_plantillas.${p.id}`);
  }
  // El diseño de prueba deja de ofrecerse (los catálogos ya publicados lo siguen usando).
  await client.query("UPDATE mk_plantillas SET activa = 0 WHERE id = 'adidas-prueba'");

  let orden = 0;
  for (const f of FIJAS) {
    const original = readFileSync(join(carpeta, f.archivo));
    const clave = `paginas-fijas/${f.id}-${resumen(original)}`;
    const { data, info } = await sharp(original).resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 86, effort: 5 }).toBuffer({ resolveWithObject: true });
    await subir(`${clave}.webp`, data, "image/webp");
    await subir(`${clave}-min.webp`, await sharp(original).resize({ width: 480 }).webp({ quality: 72, effort: 5 }).toBuffer(), "image/webp");
    await client.query(
      `INSERT INTO mk_paginas_fijas (id, nombre, tipo, imagen, ancho, alto, auto_tipo, auto_posicion, orden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, tipo = excluded.tipo, imagen = excluded.imagen,
         ancho = excluded.ancho, alto = excluded.alto, auto_tipo = excluded.auto_tipo, auto_posicion = excluded.auto_posicion,
         orden = excluded.orden, activa = 1`,
      [f.id, f.nombre, f.tipo, clave, info.width, info.height, f.auto?.[0] ?? null, f.auto?.[1] ?? null, orden++]
    );
    console.log(`Neon ✔ mk_paginas_fijas.${f.id}`);
  }
  // Zonas clicables de las portadas con bloque de contacto (los enlaces reales están en mk_enlaces; migración 014).
  await client.query("UPDATE mk_paginas_fijas SET zonas = $1 WHERE id = ANY($2) AND zonas IS NULL", [ZONAS_CONTACTO, PORTADAS_CON_CONTACTO]);
} finally {
  await client.end();
}
