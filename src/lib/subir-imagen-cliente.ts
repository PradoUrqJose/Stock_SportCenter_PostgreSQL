// Envío de UNA imagen ya estandarizada a la API del módulo (navegador).
export type ResultadoEnvio =
  | { ok: true; version: number }
  | { ok: false; error: string };

export async function enviarImagen(
  cod: string,
  png: Blob,
  modo: "nueva" | "reemplazo"
): Promise<ResultadoEnvio> {
  try {
    const res = await fetch(
      `/api/marketing/imagenes?cod=${encodeURIComponent(cod)}&modo=${modo}`,
      { method: "POST", headers: { "Content-Type": "image/png" }, body: png }
    );
    const json = (await res.json().catch(() => null)) as { error?: string; version?: number } | null;
    if (!res.ok) return { ok: false, error: json?.error ?? `Error ${res.status}` };
    return { ok: true, version: json?.version ?? 0 };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor" };
  }
}
