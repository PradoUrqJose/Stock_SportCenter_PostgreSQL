import { MarcoImagenes } from "@/components/admin/marketing/marco-imagenes";

export default function ImagenesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarcoImagenes>{children}</MarcoImagenes>;
}
