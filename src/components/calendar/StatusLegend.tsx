import { StatusIcon } from "@/components/calendar/StatusIcon";
import { STATUS_META, type DisplayStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

const ORDER: DisplayStatus[] = ["office", "remote", "vacation", "vacation_pending", "sick"];

export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-2 text-xs", className)} aria-label="Jelmagyarázat">
      {ORDER.map((s) => (
        <li key={s} className={cn("knit flex items-center gap-1.5 rounded-full border-2 px-3 py-1 font-medium", STATUS_META[s].className)}>
          <StatusIcon status={s} className="h-3.5 w-3.5" />
          {STATUS_META[s].label}
        </li>
      ))}
    </ul>
  );
}
