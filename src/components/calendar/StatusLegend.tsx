import { STATUS_META, type DisplayStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

const ORDER: DisplayStatus[] = ["office", "remote", "vacation", "vacation_pending", "sick"];

export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-2 text-xs", className)} aria-label="Jelmagyarázat">
      {ORDER.map((s) => (
        <li key={s} className={cn("flex items-center gap-1 rounded-md border px-2 py-1", STATUS_META[s].className)}>
          <span aria-hidden>{STATUS_META[s].emoji}</span>
          {STATUS_META[s].label}
        </li>
      ))}
    </ul>
  );
}
