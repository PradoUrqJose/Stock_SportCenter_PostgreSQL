import ExcelJS from "exceljs";
import { getSession, isAdminRole } from "@/lib/auth";
import { DESCUENTOS_COMISION, ENCABEZADO_OSCURO, ESTILO_ENCABEZADO_PROMOCION } from "@/lib/comisiones";
import { promocionesPorUsuario, totalesPorUsuario } from "@/lib/queries/comisiones";
export async function GET(request: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const session=await getSession(); if(!session || !isAdminRole(session.rol)) return new Response("Unauthorized",{status:401});
  const {tipo}=await params; const u=new URL(request.url), inicio=u.searchParams.get("inicio")??"", fin=u.searchParams.get("fin")??"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(fin)) return new Response("Fechas inválidas",{status:400});
  const libro=new ExcelJS.Workbook(); const hoja=libro.addWorksheet(tipo==="promociones"?"Promociones":"Totales");
  if(tipo==="promociones"){
    hoja.columns=[{header:"VENDEDOR",key:"usuario",width:38},...DESCUENTOS_COMISION.map(descuento=>({header:`${descuento}%`,key:`d${descuento}`,width:12})),{header:"TOTAL GENERAL",key:"total_general",width:16}];
    (await promocionesPorUsuario(inicio,fin)).forEach(r=>hoja.addRow(r));
    const estilos=[ENCABEZADO_OSCURO,...DESCUENTOS_COMISION.map(descuento=>ESTILO_ENCABEZADO_PROMOCION[descuento]),ENCABEZADO_OSCURO];
    hoja.getRow(1).eachCell((celda, numero)=>{ const estilo=estilos[numero-1]; celda.font={bold:true,color:{argb:estilo.textoExcel}}; celda.fill={type:"pattern",pattern:"solid",fgColor:{argb:estilo.excel}}; celda.alignment={horizontal:numero===1?"left":"center"}; });
  } else {
    hoja.columns=[{header:"USUARIO",key:"usuario",width:34},{header:"VENTAS",key:"cantidad",width:12},{header:"MONTO TOTAL",key:"monto",width:16}];
    (await totalesPorUsuario(inicio,fin)).forEach(r=>hoja.addRow(r));
    hoja.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1F3864"}};});
    hoja.getColumn("monto").numFmt='#,##0.00';
  }
  const b=await libro.xlsx.writeBuffer(); return new Response(b as unknown as BodyInit,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="comisiones-${tipo}-${inicio}-${fin}.xlsx"`}});
}
