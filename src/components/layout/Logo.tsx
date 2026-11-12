import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-bold tracking-tight", className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-base text-primary-foreground">
        K
      </span>
      <span className="text-lg">Kibent</span>
    </Link>
  );
}
