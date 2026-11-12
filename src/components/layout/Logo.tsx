import Link from "next/link";
import { cn } from "@/lib/utils";

/** Szómárka: Bodoni dőlt „Kibent” egy enyhén elforgatott vaj sárga matricán. */
export function Logo({ className, href = "/", size = "md" }: { className?: string; href?: string; size?: "md" | "lg" }) {
  return (
    <Link
      href={href}
      aria-label="Kibent – kezdőlap"
      className={cn(
        "inline-flex -rotate-2 items-center rounded-full border-2 border-ink bg-butter font-display font-bold italic leading-none text-ink shadow-brutal-xs transition-transform hover:rotate-0",
        size === "lg" ? "px-5 py-2 text-3xl" : "px-3.5 py-1.5 text-xl",
        className,
      )}
    >
      Kibent
    </Link>
  );
}
