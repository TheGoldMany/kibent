import { STATUS_META, type DisplayStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/** A státusz ikonja (Lucide), a cella szövegszínét örökli. */
export function StatusIcon({ status, className }: { status: DisplayStatus; className?: string }) {
  const Icon = STATUS_META[status].icon;
  if (!Icon) return null;
  return <Icon aria-hidden strokeWidth={2.25} className={cn("h-4 w-4 shrink-0", className)} />;
}
