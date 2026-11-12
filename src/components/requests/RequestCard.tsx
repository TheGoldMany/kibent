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
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-lilac text-xs font-bold">
          {initials(personName)}
        </span>
      )}
      <div className="min-w-0 space-y-1">
        {showPerson && <p className="truncate text-lg font-bold">{personName}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={display} className="knit border-2 px-2.5 py-1" />
          {group.status === "vacation" && group.approval !== "pending" && (
            <Badge
              variant="outline"
              className={cn(group.approval === "approved" ? "bg-emerald-100" : "bg-rose-100")}
            >
              {group.approval === "approved" ? "Jóváhagyta" : "Elutasította"}
              {reviewerName ? `: ${reviewerName}` : ""}
            </Badge>
          )}
        </div>
        <p className="text-[15px]">
          <span className="font-semibold">{formatRangeHu(group.startDate, group.endDate)}</span>, {group.dayCount} munkanap
        </p>
        {group.note && <p className="text-sm italic text-muted-foreground">„{group.note}”</p>}
      </div>
    </div>
  );
}
