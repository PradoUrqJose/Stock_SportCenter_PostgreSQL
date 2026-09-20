"use client";

const ERP_URL = "https://erp.sportcenter.pe/#m=VE&f=VEVEXPR";

export function UniversalCodeLink({ codigo }: { codigo: string }) {
  function copiarCodigo() {
    void navigator.clipboard?.writeText(codigo);
  }

  return (
    <a
      href={ERP_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.stopPropagation();
        copiarCodigo();
      }}
      title="Abrir el ERP y copiar el código universal"
      className="font-mono text-xs text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {codigo}
    </a>
  );
}
