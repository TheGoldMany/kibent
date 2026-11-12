import type { ApprovalStatus, Schedule } from "@/lib/database.types";

export type RequestRow = Pick<
  Schedule,
  "user_id" | "date" | "status" | "approval_status" | "request_group_id" | "note" | "created_at" | "reviewed_by"
>;

export type LeaveRequestGroup = {
  groupId: string;
  userId: string;
  status: "vacation" | "sick";
  approval: ApprovalStatus;
  startDate: string;
  endDate: string;
  dayCount: number;
  note: string | null;
  createdAt: string;
  reviewedBy: string | null;
};

/** Napi sorokból kérelem-csoportok (request_group_id szerint). */
export function groupRequests(rows: RequestRow[]): LeaveRequestGroup[] {
  const map = new Map<string, LeaveRequestGroup>();
  for (const r of rows) {
    if (!r.request_group_id || (r.status !== "vacation" && r.status !== "sick")) continue;
    const g = map.get(r.request_group_id);
    if (!g) {
      map.set(r.request_group_id, {
        groupId: r.request_group_id,
        userId: r.user_id,
        status: r.status,
        approval: r.approval_status,
        startDate: r.date,
        endDate: r.date,
        dayCount: 1,
        note: r.note,
        createdAt: r.created_at,
        reviewedBy: r.reviewed_by,
      });
      continue;
    }
    g.dayCount++;
    if (r.date < g.startDate) g.startDate = r.date;
    if (r.date > g.endDate) g.endDate = r.date;
    if (r.approval_status === "pending") g.approval = "pending";
    g.note ??= r.note;
    g.reviewedBy ??= r.reviewed_by;
  }
  return [...map.values()].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
}
