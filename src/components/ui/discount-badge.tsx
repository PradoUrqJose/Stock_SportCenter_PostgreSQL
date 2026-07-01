import { getDiscountColor } from "@/lib/discount-colors";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  className?: string;
};

/** Semi-rounded label for a discount %, colored per the shared discount palette when it's an exact 10/20/…/70 level. */
export function DiscountBadge({ value, className }: Props) {
  if (!value || value <= 0) return <span className="text-gray-400">—</span>;

  const color = getDiscountColor(value);
  if (!color) {
    return <span className={cn("text-sm font-medium", className)}>{value}%</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold",
        color.tailwind,
        color.text === "white" ? "text-white" : "text-black",
        className
      )}
    >
      {value}%
    </span>
  );
}
