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
        <Button asChild variant={isCurrent ? "default" : "outline"} size="sm" className="h-11 px-4">
          <Link href={href(view)} scroll={false}>
            Ma
          </Link>
        </Button>
      </div>
      <h2 className="order-first min-w-0 basis-full truncate font-display text-2xl font-semibold italic sm:order-none sm:flex-1 sm:basis-auto">{rangeTitle(view, start, end)}</h2>
      <div className="flex gap-1 rounded-full border-2 border-ink bg-white p-1 text-sm" role="group" aria-label="Nézet">
        {VIEW_MODES.map((v) => (
          <Link
            key={v}
            href={href(v, anchor)}
            scroll={false}
            aria-current={v === view ? "true" : undefined}
            className={cn(
              "rounded-full border-2 px-3.5 py-1.5 font-semibold transition-colors",
              v === view ? "border-ink bg-lilac" : "border-transparent hover:bg-lilac-soft",
            )}
          >
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </div>
    </div>
  );
}
