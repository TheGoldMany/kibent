import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VIEW_LABELS, VIEW_MODES, rangeTitle, shiftAnchor, type ViewMode } from "@/lib/dates";
import { cn } from "@/lib/utils";

function href(view: ViewMode, date?: string) {
  const p = new URLSearchParams();
  if (view !== "week") p.set("view", view);
  if (date) p.set("date", date);
  const q = p.toString();
  return q ? `/?${q}` : "/";
}

export function CalendarToolbar({
  view,
  anchor,
  start,
  end,
  isCurrent,
}: {
  view: ViewMode;
  anchor: string;
  start: string;
  end: string;
  isCurrent: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button asChild variant="outline" size="icon" aria-label="Előző időszak">
          <Link href={href(view, shiftAnchor(view, anchor, -1))} scroll={false}>
            <ChevronLeft />
          </Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label="Következő időszak">
          <Link href={href(view, shiftAnchor(view, anchor, 1))} scroll={false}>
            <ChevronRight />
          </Link>
        </Button>
        <Button asChild variant={isCurrent ? "secondary" : "outline"} size="sm" className="h-10">
          <Link href={href(view)} scroll={false}>
            Ma
          </Link>
        </Button>
      </div>
      <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{rangeTitle(view, start, end)}</h2>
      <div className="flex rounded-lg bg-muted p-1 text-sm" role="group" aria-label="Nézet">
        {VIEW_MODES.map((v) => (
          <Link
            key={v}
            href={href(v, anchor)}
            scroll={false}
            aria-current={v === view ? "true" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              v === view ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </div>
    </div>
  );
}
