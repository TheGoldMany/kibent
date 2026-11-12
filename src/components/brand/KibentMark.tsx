import { cn } from "@/lib/utils";

/** A Bodoni Moda dőlt „K” útvonala (a 64×64-es jelhez igazítva). */
const K_PATH =
  "M20.91 34.98L18.91 34.98L41.05 16.57L42.87 16.57L20.91 34.98ZM25.17 42.50L12.00 42.50L12.00 41.23L25.17 41.23L25.17 42.50ZM40.88 42.50L26.80 42.50L26.80 41.23L40.88 41.23L40.88 42.50ZM22.40 42.50L14.95 42.50L20.84 16.50L28.29 16.50L22.40 42.50ZM38.17 42.50L29.87 42.50L25.45 29.67L31.72 24.73L38.17 42.50ZM31.59 17.77L17.72 17.77L17.72 16.50L31.59 16.50L31.59 17.77ZM45.00 17.77L36.68 17.77L36.68 16.50L45.00 16.50L45.00 17.77Z";

/**
 * A Kibent jele: vaj sárga matrica tinta kerettel és kemény árnyékkal, benne a
 * Bodoni „K”, a sarkában rózsaszín „jelen van” pötty.
 * variant="dark": sötét háttérre (krém keret, rózsaszín árnyék).
 */
export function KibentMark({ className, variant = "light" }: { className?: string; variant?: "light" | "dark" }) {
  const stroke = variant === "dark" ? "#FCFAFF" : "#000";
  const shadow = variant === "dark" ? "#FFB9DA" : "#000";
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("h-10 w-10 shrink-0", className)}>
      <g transform="rotate(-8 32 32)">
        <circle cx="33.5" cy="34" r="25.5" fill={shadow} />
        <circle cx="30" cy="30.5" r="25.5" fill="#FFE27A" stroke={stroke} strokeWidth="3" />
        <path d={K_PATH} fill="#000" />
        <circle cx="48.5" cy="49" r="7.5" fill="#FFB9DA" stroke={stroke} strokeWidth="3" />
      </g>
    </svg>
  );
}
