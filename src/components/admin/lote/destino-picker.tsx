"use client";

export type Destino = "borrador" | "publicado";

type Props = {
  value: Destino;
  onChange: (d: Destino) => void;
  publicado: { id: number } | null;
};

export function DestinoPicker({ value, onChange, publicado }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-[#dddddd] bg-[#f8fafc] p-1">
      <button
        type="button"
        onClick={() => onChange("borrador")}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          value === "borrador"
            ? "bg-white text-[#181d26] shadow-sm"
            : "text-[#41454d] hover:text-[#181d26]"
        }`}
      >
        Borrador
      </button>
      {publicado && (
        <button
          type="button"
          onClick={() => onChange("publicado")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === "publicado"
              ? "bg-white text-[#181d26] shadow-sm"
              : "text-[#41454d] hover:text-[#181d26]"
          }`}
        >
          {`Publicado #${publicado.id}`}
        </button>
      )}
    </div>
  );
}
