import type { ApprovalStatus, ScheduleStatus } from "@/lib/database.types";

export type DisplayStatus = ScheduleStatus | "vacation_pending" | "none";

export const STATUS_META: Record<
  DisplayStatus,
  { label: string; short: string; emoji: string; className: string; icalTitle?: string }
> = {
  office: {
    label: "Iroda",
    short: "Iroda",
    emoji: "🏢",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    icalTitle: "[Kibent] Iroda",
  },
  remote: {
    label: "Home Office",
    short: "HO",
    emoji: "🏠",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icalTitle: "[Kibent] Home Office",
  },
  vacation: {
    label: "Szabadság",
    short: "Szab.",
    emoji: "🌴",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    icalTitle: "[Kibent] Szabadság",
  },
  vacation_pending: {
    label: "Szabadság (függőben)",
    short: "Függő",
    emoji: "⏳",
    className: "border-dashed border-amber-400 bg-amber-50/50 text-amber-700",
    icalTitle: "[Kibent] Szabadság (függőben)",
  },
  sick: {
    label: "Betegszabadság",
    short: "Beteg",
    emoji: "🤒",
    className: "bg-rose-100 text-rose-800 border-rose-200",
    icalTitle: "[Kibent] Betegszabadság",
  },
  none: {
    label: "Nincs megadva",
    short: "–",
    emoji: "",
    className: "border-dashed border-border bg-transparent text-muted-foreground",
  },
};

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  approved: "Jóváhagyva",
  pending: "Függőben",
  rejected: "Elutasítva",
};
