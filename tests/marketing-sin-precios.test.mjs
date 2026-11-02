import assert from 'node:assert/strict';
import {test} from 'node:test';
import './helpers/resolver-typescript.mjs';
const {construirBorrador,normalizarFiltros,plantillaGeneral,plantillaDelCatalogo,armarSnapshot}=await import('../src/lib/marketing-catalogo.ts');
const {sincronizarBorrador}=await import('../src/lib/marketing-sincronizar.ts');
const {documentoDelCatalogo}=await import('../src/components/admin/marketing/documento-catalogo.ts');
const zona={x:0,y:0,w:100,h:30};
const plantillas=[['adidas','ADIDAS'],['nike','NIKE'],['general','*'],['otra','*']].map(([id,marca])=>({id,marca,nombre:id,activa:true,predeterminada:id!=='otra',fondo:`plantillas/${id}`,ancho:2000,alto:1125,zonas:{codigo:zona,tallas:zona,precio:zona,zapatilla:zona}}));
const item=(cod,marca='ADIDAS',precio=149.9)=>({cod_universal:cod,marca,modelo:cod,genero:'HOMBRE',tallas:{'9':1},stock_total:1,precio_venta:precio});
const filtros={plantillas:{ADIDAS:'adidas'},sin_precios:true,plantilla_general:'general'};
const crear=(items,sinPrecios=true)=>construirBorrador(items,new Map(),marca=>plantillaDelCatalogo(marca,plantillas,{...filtros,sin_precios:sinPrecios}),{min:null,max:null,sinPrecios});

test('sin precios usa la misma GENERAL con marcas que tienen su propia plantilla y el preview coincide',()=>{
 assert.equal(plantillaDelCatalogo('ADIDAS',plantillas,filtros),'general');
 assert.equal(plantillaDelCatalogo('NIKE',plantillas,{...filtros,sin_precios:false}),'nike');
 const d=documentoDelCatalogo({tipo:'',plantillas:filtros.plantillas,sinPrecios:true,plantillaGeneral:'general',portada:null},plantillas,[],[{marca:'ADIDAS',productos:1},{marca:'NIKE',productos:1}]);
 assert.deepEqual(d.plantillas.map(p=>p.plantilla.id),['general']);assert.deepEqual(d.plantillas[0].marcas,['ADIDAS','NIKE']);
 assert.equal(plantillaGeneral(plantillas,'adidas'),null);
 assert.equal(plantillaGeneral(plantillas.map(p=>({...p,activa:false}))),null);
 assert.equal(plantillaGeneral(plantillas,'borrada'),null);
});

test('sin precios conserva stock sin importe y el snapshot público no contiene los precios del ERP',()=>{
 const items=[item('A','ADIDAS',149.9),item('B','NIKE',null),item('C','NIKE',0),{...item('D'),tallas:{}}];
 const b=crear(items);assert.equal(b.productos.length,3);assert.equal(b.resumen.sin_stock,1);assert.equal(b.resumen.sin_explicar,0);
 assert.ok(b.productos.every(p=>p.precio===null));assert.ok(b.paginas.every(p=>p.plantilla==='general'));
 const s=armarSnapshot('Sin precios',b,Object.fromEntries(plantillas.map(p=>[p.id,p])),'https://img.test');
 assert.equal(s.sin_precios,true);assert.ok(s.productos.every(p=>p.precio===null));assert.doesNotMatch(JSON.stringify(s),/149\.9/);
 b.productos[0].precio=149.9;
 assert.equal(armarSnapshot('Sin precios',b,{},'https://img.test').productos[0].precio,null);
 const normal=crear(items,false);assert.deepEqual(normal.productos.map(p=>p.precio),[149.9]);
});

test('ocultar importes conserva los filtros de precio pedidos y los catálogos anteriores siguen con precio',()=>{
 const b=construirBorrador([item('A','ADIDAS',149.9),item('B','NIKE',null)],new Map(),()=> 'general',{min:100,max:200,sinPrecios:true});
 assert.deepEqual(b.productos.map(p=>p.cod),['A']);assert.equal(b.resumen.fuera_de_precio,1);
 const f=normalizarFiltros({...filtros,grupos:['ZAPATILLAS']});assert.equal(f.sin_precios,true);assert.equal(f.plantilla_general,'general');
 assert.equal(normalizarFiltros({}).sin_precios,false);
});

test('sincronizar cambia a GENERAL y oculta también importes de quitadas; volver a con precios recupera los importes y diseños',()=>{
 const actual=crear([item('A'),item('B','NIKE')],false);
 actual.paginas[0].ajuste={dx:12,dy:8,s:1.1};
 const quitada={...actual.paginas.pop(),id:'quitada'};actual.quitadas=[quitada];
 const fresco=crear([item('A'),item('B','NIKE')]);
 const {borrador}=sincronizarBorrador(actual,fresco,'2026-11-02T12:00:00Z');
 assert.equal(borrador.sin_precios,true);assert.ok(borrador.productos.every(p=>p.precio===null));
 assert.ok([...borrador.paginas,...borrador.quitadas].every(p=>p.plantilla==='general'));
 assert.deepEqual(borrador.paginas[0].ajuste,{dx:12,dy:8,s:1.1});
 const repetida=sincronizarBorrador(borrador,fresco,'2026-11-02T12:01:00Z');assert.equal(repetida.informe.cambiosPrecio,0);
 const vuelta=sincronizarBorrador(borrador,crear([item('A','ADIDAS',160),item('B','NIKE',180)],false),'2026-11-02T12:02:00Z').borrador;
 assert.equal(vuelta.sin_precios,undefined);assert.equal(vuelta.productos[0].precio,160);assert.equal(vuelta.paginas[0].plantilla,'adidas');
});
