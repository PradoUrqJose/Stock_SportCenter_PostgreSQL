// Los tests ejecutan el mismo código de servidor con dobles de red/BD, sin Next en marcha.
import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const raiz = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
registerHooks({
  load(url, context, siguiente) {
    if (url.startsWith(pathToFileURL(resolve(raiz, 'src')).href) && url.endsWith('.ts')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    }
    return siguiente(url, context);
  },
  resolve(specifier, context, siguiente) {
    let ruta;
    if (specifier.startsWith('@/')) ruta = resolve(raiz, 'src', specifier.slice(2));
    else if (specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(resolve(raiz, 'src')).href)) {
      ruta = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (ruta) {
      for (const extension of ['', '.ts', '.tsx']) {
        if (existsSync(ruta + extension)) return siguiente(pathToFileURL(ruta + extension).href, context);
      }
    }
    try { return siguiente(specifier, context); }
    catch (e) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':')) return siguiente(pathToFileURL(require.resolve(specifier)).href, context);
      throw e;
    }
  },
});
