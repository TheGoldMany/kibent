import { StatusPill } from "@/components/calendar/StatusPill";
import { Badge } from "@/components/ui/badge";
import { formatRangeHu } from "@/lib/dates";
import type { LeaveRequestGroup } from "@/lib/requests";
import { cn, initials } from "@/lib/utils";

export function RequestSummary({
  group,
  personName,
  reviewerName,
  showPerson = true,
}: {
  group: LeaveRequestGroup;
  personName: string;
  reviewerName?: string | null;
  showPerson?: boolean;
}) {
  const display = group.status === "vacation" && group.approval === "pending" ? "vacation_pending" : group.status;
  return (
    <div className="flex min-w-0 items-start gap-3">
      {showPerson && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {initials(personName)}
        </span>
      )}
      <div className="min-w-0 space-y-1">
        {showPerson && <p className="truncate font-medium">{personName}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={display} />
          {group.status === "vacation" && group.approval !== "pending" && (
            <Badge
              variant="outline"
              className={cn(
                group.approval === "approved" ? "border-emerald-300 text-emerald-800" : "border-rose-300 text-rose-800",
              )}
            >
              {group.approval === "approved" ? "Jóváhagyva" : "Elutasítva"}
              {reviewerName ? ` · ${reviewerName}` : ""}
            </Badge>
          )}
        </div>
        <p className="text-sm">
          {formatRangeHu(group.startDate, group.endDate)}{" "}
          <span className="text-muted-foreground">· {group.dayCount} munkanap</span>
        </p>
        {group.note && <p className="text-sm italic text-muted-foreground">„{group.note}”</p>}
      </div>
    </div>
  );
}
