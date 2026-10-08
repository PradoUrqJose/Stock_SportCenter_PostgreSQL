import { HistorialTraslado } from "@/lib/traslados-historial";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <HistorialTraslado id={Number((await params).id)} admin />;
}
