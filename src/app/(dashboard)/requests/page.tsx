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
import { withUser } from "@/lib/db";
import { formatRangeHu, parseISODate, toISODate, todayISO } from "@/lib/dates";
import { groupRequests, type LeaveRequestGroup, type RequestRow } from "@/lib/requests";

export const metadata: Metadata = { title: "Kérelmek" };

const HISTORY_DAYS = 90;

export default async function RequestsPage() {
  const ctx = await requireMember();
  const isAdmin = ctx.profile.role === "admin";
  const today = todayISO();
  const since = toISODate(subDays(parseISODate(today), HISTORY_DAYS));

  // Egyetlen adatbázis-kör: minden lista JSON-ként (RLS alatt).
  const row = (r: string) =>
    `json_build_object('user_id', ${r}.user_id, 'date', ${r}.date, 'status', ${r}.status,
       'approval_status', ${r}.approval_status, 'request_group_id', ${r}.request_group_id,
       'note', ${r}.note, 'created_at', ${r}.created_at, 'reviewed_by', ${r}.reviewed_by)`;
  const data = await withUser(ctx.userId, (tx) =>
    tx.one<{
      own: RequestRow[];
      pending: RequestRow[];
      team: RequestRow[];
      members: { id: string; full_name: string }[];
      docs: (DocItem & { request_group_id: string })[];
    }>(
      `select
         coalesce((select json_agg(${row("s")}) from schedules s
                    where s.user_id = $2 and s.status in ('vacation', 'sick')
                      and s.request_group_id is not null and s.date >= $3), '[]') as own,
         coalesce((select json_agg(${row("s")}) from schedules s
                    where $4 and s.company_id = $1 and s.status = 'vacation'
                      and s.approval_status = 'pending' and s.user_id <> $2), '[]') as pending,
         coalesce((select json_agg(${row("s")}) from schedules s
                    where $4 and s.company_id = $1 and s.status in ('sick', 'vacation')
                      and s.approval_status <> 'pending' and s.user_id <> $2
                      and s.request_group_id is not null and s.date >= $3), '[]') as team,
         coalesce((select json_agg(json_build_object('id', id, 'full_name', full_name))
                     from profiles where company_id = $1), '[]') as members,
         -- RLS: member csak a sajátját, admin a cég összes igazolását kapja vissza
         coalesce((select json_agg(json_build_object('id', id, 'request_group_id', request_group_id,
                                                     'file_name', file_name, 'mime_type', mime_type,
                                                     'uploaded_at', uploaded_at) order by uploaded_at)
                     from medical_documents), '[]') as docs`,
      [ctx.company.id, ctx.userId, since, isAdmin],
    ),
  );
  if (!data) throw new Error("Nem sikerült betölteni a kérelmeket.");

  const names: Record<string, string> = Object.fromEntries(data.members.map((m) => [m.id, m.full_name]));
  const docsByGroup = new Map<string, DocItem[]>();
  for (const d of data.docs) {
    const list = docsByGroup.get(d.request_group_id) ?? [];
    list.push(d);
    docsByGroup.set(d.request_group_id, list);
  }

  const own = groupRequests(data.own);
  const pending = groupRequests(data.pending).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const teamHistory = groupRequests(data.team);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl font-bold leading-none sm:text-6xl">Kérelmek</h1>
          <p className="mt-3 text-lg">
            {isAdmin ? "Szabadságkérelmek elbírálása és a csapat távollétei." : "Szabadságkérelmeid és betegszabadságaid."}
          </p>
        </div>
        <LeaveRequestModal isAdmin={isAdmin} today={today} />
      </div>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-3 font-display text-3xl font-bold">
            Jóváhagyásra vár
            {pending.length > 0 && (
              <span className="rounded-full border-2 border-ink bg-amber-300 px-2.5 py-0.5 font-sans text-sm font-bold">{pending.length}</span>
            )}
          </h2>
          <ApprovalQueue groups={pending} names={names} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-3xl font-bold">Saját kérelmeim</h2>
        {own.length === 0 ? (
          <EmptyState text="Még nincs szabadság- vagy betegszabadság-bejegyzésed az elmúlt 90 napban." />
        ) : (
          <div className="space-y-4">
            {own.map((g) => (
              <OwnRequestRow key={g.groupId} group={g} docs={docsByGroup.get(g.groupId) ?? []} names={names} today={today} />
            ))}
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <div>
            <h2 className="font-display text-3xl font-bold">Csapat távollétei</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <Lock className="h-3.5 w-3.5" /> Az orvosi igazolásokat csak az adminisztrátorok és a feltöltő láthatják.
            </p>
          </div>
          {teamHistory.length === 0 ? (
            <EmptyState text="Nincs rögzített távollét az elmúlt 90 napban." />
          ) : (
            <div className="space-y-4">
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
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink bg-white p-8 text-center">
      <Inbox className="h-8 w-8" />
      <p>{text}</p>
    </div>
  );
}
