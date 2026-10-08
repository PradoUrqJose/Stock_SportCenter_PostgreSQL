export type Lado = "izq" | "der";
export type Estado = "solicitado" | "enviado" | "recibido";
export type Parte = { lado: Lado; origen: string };

function ubicaciones(izq: string, der: string): Parte[] {
  return [{ lado: "izq", origen: izq }, { lado: "der", origen: der }];
}

export function partesParaSolicitud(izq: string, der: string, destino: string): Parte[] {
  return ubicaciones(izq, der).filter((parte) => parte.origen && parte.origen !== destino);
}

export function partesParaEnvio(izq: string, der: string, origen: string): Parte[] {
  return ubicaciones(izq, der).filter((parte) => parte.origen === origen);
}

export function estadoGeneral(partes: Estado[]): Estado | "parcial" {
  if (!partes.length) throw new Error("Un traslado necesita al menos un lado");
  return partes.every((estado) => estado === partes[0]) ? partes[0] : "parcial";
}

export function siguienteEstado(estado: Estado, origen: string, destino: string, sede: string): Estado | null {
  if (estado === "solicitado" && sede === origen) return "enviado";
  if (estado === "enviado" && sede === destino) return "recibido";
  return null;
}
