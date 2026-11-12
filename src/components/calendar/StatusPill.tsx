import { StatusIcon } from "@/components/calendar/StatusIcon";
import { STATUS_META, type DisplayStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusPill({ status, className }: { status: DisplayStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium", meta.className, className)}>
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
