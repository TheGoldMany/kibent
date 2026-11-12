import type { Metadata } from "next";
import { Inbox, Lock } from "lucide-react";
import { subDays } from "date-fns";
import { ApprovalQueue } from "@/components/requests/ApprovalQueue";
import { MedicalDocViewer, type DocItem } from "@/components/requests/MedicalDocViewer";
import { CancelRequestButton, UploadDocForm } from "@/components/requests/MyRequestActions";
import { RequestSummary } from "@/components/requests/RequestCard";
import { LeaveRequestModal } from "@/components/calendar/LeaveRequestModal";
import { Card, CardContent } from "@/components/ui/card";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRangeHu, parseISODate, toISODate, todayISO } from "@/lib/dates";
import { groupRequests, type LeaveRequestGroup } from "@/lib/requests";

export const metadata: Metadata = { title: "Kérelmek" };

const HISTORY_DAYS = 90;

export default async function RequestsPage() {
  const ctx = await requireMember();
  const isAdmin = ctx.profile.role === "admin";
  const today = todayISO();
  const since = toISODate(subDays(parseISODate(today), HISTORY_DAYS));
  const supabase = await createClient();

  const columns = "user_id, date, status, approval_status, request_group_id, note, created_at, reviewed_by";

  const [ownRes, pendingRes, teamSickRes, membersRes, docsRes] = await Promise.all([
    supabase
      .from("schedules")
      .select(columns)
      .eq("user_id", ctx.userId)
      .in("status", ["vacation", "sick"])
      .not("request_group_id", "is", null)
      .gte("date", since),
    isAdmin
      ? supabase
          .from("schedules")
          .select(columns)
          .eq("company_id", ctx.company.id)
          .eq("status", "vacation")
          .eq("approval_status", "pending")
          .neq("user_id", ctx.userId)
      : Promise.resolve({ data: [], error: null }),
    isAdmin
      ? supabase
          .from("schedules")
          .select(columns)
          .eq("company_id", ctx.company.id)
          .in("status", ["sick", "vacation"])
          .neq("approval_status", "pending")
          .neq("user_id", ctx.userId)
          .not("request_group_id", "is", null)
          .gte("date", since)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("profiles").select("id, full_name").eq("company_id", ctx.company.id),
    // RLS: member csak a sajátját, admin a cég összes igazolását kapja vissza
    supabase.from("medical_documents").select("id, request_group_id, file_name, mime_type, uploaded_at").order("uploaded_at"),
  ]);

  if (ownRes.error || pendingRes.error || teamSickRes.error || membersRes.error || docsRes.error) {
    throw new Error("Nem sikerült betölteni a kérelmeket.");
  }

  const names: Record<string, string> = Object.fromEntries(membersRes.data.map((m) => [m.id, m.full_name]));
  const docsByGroup = new Map<string, DocItem[]>();
  for (const d of docsRes.data) {
    const list = docsByGroup.get(d.request_group_id) ?? [];
    list.push(d);
    docsByGroup.set(d.request_group_id, list);
  }

  const own = groupRequests(ownRes.data);
  const pending = groupRequests(pendingRes.data).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const teamHistory = groupRequests(teamSickRes.data);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kérelmek</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Szabadságkérelmek elbírálása és a csapat távollétei." : "Szabadságkérelmeid és betegszabadságaid."}
          </p>
        </div>
        <LeaveRequestModal isAdmin={isAdmin} today={today} />
      </div>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Jóváhagyásra vár
            {pending.length > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{pending.length}</span>
            )}
          </h2>
          <ApprovalQueue groups={pending} names={names} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Saját kérelmeim</h2>
        {own.length === 0 ? (
          <EmptyState text="Még nincs szabadság- vagy betegszabadság-bejegyzésed az elmúlt 90 napban." />
        ) : (
          <div className="space-y-2">
            {own.map((g) => (
              <OwnRequestRow key={g.groupId} group={g} docs={docsByGroup.get(g.groupId) ?? []} names={names} today={today} />
            ))}
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Csapat távollétei</h2>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Az orvosi igazolásokat csak az adminisztrátorok és a feltöltő láthatják.
            </p>
          </div>
          {teamHistory.length === 0 ? (
            <EmptyState text="Nincs rögzített távollét az elmúlt 90 napban." />
          ) : (
            <div className="space-y-2">
              {teamHistory.map((g) => (
                <Card key={g.groupId}>
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
                    <RequestSummary
                      group={g}
                      personName={names[g.userId] ?? "Korábbi tag"}
                      reviewerName={g.reviewedBy ? names[g.reviewedBy] : null}
                    />
                    {g.status === "sick" && (
                      <div className="md:w-80">
                        {(docsByGroup.get(g.groupId) ?? []).length > 0 ? (
                          <MedicalDocViewer docs={docsByGroup.get(g.groupId)!} canDelete={false} />
                        ) : (
                          <p className="text-sm text-muted-foreground">Nincs feltöltött igazolás.</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function OwnRequestRow({
  group,
  docs,
  names,
  today,
}: {
  group: LeaveRequestGroup;
  docs: DocItem[];
  names: Record<string, string>;
  today: string;
}) {
  const isPast = group.endDate < today;
  const label = `${group.status === "sick" ? "betegszabadság" : "szabadság"} (${formatRangeHu(group.startDate, group.endDate)})`;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <RequestSummary
            group={group}
            personName=""
            showPerson={false}
            reviewerName={group.reviewedBy ? names[group.reviewedBy] : null}
          />
          {(!isPast || group.approval === "pending") && (
            <CancelRequestButton groupId={group.groupId} label={label} />
          )}
        </div>
        {group.status === "sick" && (
          <div className="space-y-2 border-t pt-3">
            <MedicalDocViewer docs={docs} canDelete />
            <UploadDocForm groupId={group.groupId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      <Inbox className="h-8 w-8" />
      <p>{text}</p>
    </div>
  );
}
