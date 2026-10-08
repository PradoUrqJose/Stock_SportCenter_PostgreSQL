import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claveDerivado, urlDerivado } from '../src/lib/marketing-rutas-imagen.ts';

test('ruta fija con revisión de caché y códigos que requieren codificación', () => {
  assert.equal(claveDerivado(600, '025994-16'), 'derivados/w600/025994-16.webp');
  assert.equal(claveDerivado(600, '400497_07'), 'derivados/w600/400497-07.webp');
  assert.equal(urlDerivado('https://img.example/', 1200, 'FPF 02092', 7), 'https://img.example/derivados/w1200/FPF%2002092.webp?v=7');
  assert.equal(new URL(urlDerivado('https://img.example',600,'025994-16',2)).pathname,new URL(urlDerivado('https://img.example',600,'025994-16',3)).pathname);
});

test('consumidores y escritores dejan de solicitar/crear archivos versionados', () => {
  const paths=['src/lib/marketing.ts','src/lib/marketing-subida.ts','src/lib/marketing-pdf.ts','src/components/catalogo/visor-catalogo.tsx','src/components/admin/marketing/paso-final.tsx'];
  for(const path of paths) {
    const text=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.doesNotMatch(text,/\.v\$\{[^}]+\}\.webp/,path);
  }
  const upload=readFileSync(new URL('../src/lib/marketing-subida.ts',import.meta.url),'utf8');
  assert.doesNotMatch(upload,/await r2Copiar/);
  assert.match(upload,/max-age=300, must-revalidate/);
});
