"use client";

import { RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_META } from "@/lib/status";
import { formatHu } from "@/lib/dates";
import type { ResolvedDay } from "@/lib/schedule-resolver";
import { cn } from "@/lib/utils";

export function DayCell({
  day,
  personName,
  isOwn,
  isWeekend,
  isToday,
  compact,
  showNote,
  onToggle,
  onReset,
}: {
  day: ResolvedDay;
  personName: string;
  isOwn: boolean;
  isWeekend: boolean;
  isToday: boolean;
  compact: boolean;
  showNote: boolean;
  onToggle?: () => void;
  onReset?: () => void;
}) {
  const meta = STATUS_META[day.display];
  const isLeave = day.status === "vacation" || day.status === "sick";
  const interactive = isOwn && !!onToggle && !isLeave;

  const sourceText =
    day.source === "pattern"
      ? "Heti rutin alapján"
      : day.source === "explicit" && !isLeave
        ? "Egyedi beállítás erre a napra"
        : null;

  const body = (
    <span
      className={cn(
        "flex h-11 w-full items-center justify-center gap-1 rounded-lg border-2 text-xs font-semibold",
        day.display !== "none" && "knit",
        meta.className,
        day.source === "pattern" && "opacity-75",
        day.display === "none" && isWeekend && "border-transparent",
      )}
    >
      {day.display !== "none" ? (
        <>
          <span aria-hidden>{meta.emoji}</span>
          {!compact && <span className="hidden truncate sm:inline">{meta.short}</span>}
        </>
      ) : (
        !isWeekend && <span className="text-muted-foreground/60">–</span>
      )}
    </span>
  );

  const label = `${personName}, ${formatHu(day.date, "MMMM d., EEEE")}: ${meta.label}`;

  return (
    <td
      className={cn(
        "group relative border-b border-r p-1",
        isWeekend && "bg-lilac-soft/70",
        isToday && "bg-butter/40",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          {interactive ? (
            <button
              type="button"
              onClick={onToggle}
              aria-label={`${label}. Kattints a váltáshoz.`}
              className={cn(
                "block w-full rounded-md outline-none ring-offset-background transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                isWeekend && "opacity-60 hover:opacity-100",
              )}
            >
              {body}
            </button>
          ) : (
            <div tabIndex={0} aria-label={label} className={cn("rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", isWeekend && "opacity-60")}>
              {body}
            </div>
          )}
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="font-medium">{personName}</p>
          <p className="text-xs text-muted-foreground">{formatHu(day.date, "yyyy. MMMM d., EEEE")}</p>
          <p className="mt-1">
            {meta.emoji} {meta.label}
          </p>
          {sourceText && <p className="text-xs text-muted-foreground">{sourceText}</p>}
          {showNote && day.note && <p className="mt-1 text-xs italic">„{day.note}”</p>}
          {interactive && (
            <p className="mt-1 text-xs text-primary">
              Kattints: {day.status === "office" ? "Home Office" : "Iroda"}
            </p>
          )}
          {isOwn && isLeave && (
            <p className="mt-1 text-xs text-muted-foreground">Módosítás a Kérelmek oldalon.</p>
          )}
        </TooltipContent>
      </Tooltip>
      {isOwn && onReset && day.source === "explicit" && !isLeave && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Visszaállítás a heti rutinra"
          title="Visszaállítás a heti rutinra"
          className="absolute right-0 top-0 hidden h-6 w-6 place-items-center rounded-full border-2 border-ink bg-white shadow-brutal-xs focus-visible:grid group-hover:grid"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </td>
  );
}
