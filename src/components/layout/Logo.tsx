import Link from "next/link";
import { KibentMark } from "@/components/brand/KibentMark";
import { cn } from "@/lib/utils";

/** Logó: a matrica-jel és a Bodoni dőlt „Kibent” szómárka. */
export function Logo({
  className,
  href = "/",
  size = "md",
  variant = "light",
  compact = false,
}: {
  className?: string;
  href?: string;
  size?: "md" | "lg";
  variant?: "light" | "dark";
  /** Keskeny képernyőn csak a jel látszik (zsúfolt fejléc). */
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="Kibent – kezdőlap"
      className={cn("group inline-flex items-center gap-2 leading-none", className)}
    >
      <KibentMark
        variant={variant}
        className={cn("transition-transform group-hover:rotate-6", size === "lg" ? "h-12 w-12" : "h-10 w-10")}
      />
      <span
        className={cn(
          "font-display font-bold italic tracking-tight",
          size === "lg" ? "text-[2.1rem]" : "text-[1.7rem]",
          variant === "dark" ? "text-cotton" : "text-ink",
          compact && "hidden md:inline",
        )}
      >
        Kibent
      </span>
    </Link>
  );
}
