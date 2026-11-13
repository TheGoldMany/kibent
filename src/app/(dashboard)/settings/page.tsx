import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSync, Clock, LogOut, Settings2, MailPlus, Repeat, User, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RecurringPatternForm } from "@/components/calendar/RecurringPatternModal";
import { CompanyForm, IcalLinks, LeaveTeamButton, MemberList, ProfileForm } from "@/components/settings/SettingsForms";
import { cn } from "@/lib/utils";
import { WorkHoursForm } from "@/components/settings/WorkHoursForm";
import { InviteForm } from "@/components/invites/InviteForm";
import { InvitationList } from "@/components/invites/InvitationList";
import { requireMember, withMember } from "@/lib/auth";
import { hasV2Schema, SCHEMA_PENDING_MESSAGE } from "@/lib/schema";
import type { CompanyInvitation, Role, WorkHours } from "@/lib/database.types";
import type { PatternDays } from "@/lib/schedule-resolver";
import { siteUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Beállítások" };

const TABS = [
  { id: "profil", label: "Profil", icon: User },
  { id: "beosztas", label: "Beosztás", icon: Repeat },
  { id: "naptar", label: "Naptár szinkron", icon: CalendarSync },
  { id: "csapat", label: "Csapat", icon: Users },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> } = {}) {
  const params = (await searchParams) ?? {};
  const tab: TabId = TABS.some((t) => t.id === params.tab) ? (params.tab as TabId) : "profil";
  const ctx = await requireMember();
  const isAdmin = ctx.profile.role === "admin";
  const v2 = await hasV2Schema();
  // Egyetlen adatbázis-kör
  const data = await withMember(ctx, (tx) =>
    tx.one<{
      pattern: PatternDays | null;
      members: { id: string; full_name: string; email: string; role: Role }[];
      work_hours: WorkHours[];
      invitations: CompanyInvitation[];
    }>(
      `select
         (select json_build_object('mon', mon, 'tue', tue, 'wed', wed, 'thu', thu, 'fri', fri)
            from recurring_patterns where user_id = $1 and company_id = $2) as pattern,
         coalesce((select json_agg(json_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', m.role))
                     from memberships m join profiles p on p.id = m.user_id where m.company_id = $2), '[]') as members,
         ${
           v2
             ? `coalesce((select json_agg(json_build_object('user_id', user_id, 'weekday', weekday, 'start_time', start_time,
                                                     'end_time', end_time, 'lunch_start', lunch_start) order by weekday)
                     from work_hours where user_id = $1 and company_id = $2), '[]') as work_hours,
         -- RLS: csak admin látja (member esetén üres)
         coalesce((select json_agg(json_build_object('id', id, 'email', email, 'token', token, 'created_at', created_at,
                                                     'expires_at', expires_at, 'accepted_at', accepted_at)
                                   order by created_at desc)
                     from company_invitations where $3 and company_id = $2 and accepted_at is null), '[]') as invitations`
             : `'[]'::json as work_hours, '[]'::json as invitations`
         }`,
      [ctx.userId, ctx.company.id, isAdmin],
    ),
  );
  const pattern = data?.pattern ?? null;
  const workHours = data?.work_hours ?? [];
  const invitations = data?.invitations ?? [];
  const rawMembers = data?.members ?? [];

  const base = siteUrl();
  const icalUrl = `${base}/api/ical/${ctx.profile.ical_token}/calendar.ics?c=${ctx.company.id}`;
  const collator = new Intl.Collator("hu");
  const members = [...rawMembers].sort((a, b) => collator.compare(a.full_name, b.full_name));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-5xl font-bold leading-none sm:text-6xl">Beállítások</h1>
        <nav aria-label="Beállítások" className="-mx-3 mt-6 flex gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={id === "profil" ? "/settings" : `/settings?tab=${id}`}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "press inline-flex shrink-0 items-center gap-2 rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold",
                tab === id ? "bg-butter shadow-brutal-xs" : "bg-white hover:bg-lilac-soft",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "profil" && (
        <Section icon={User} title="Profil" description="A neved így jelenik meg a kollégáid naptárában.">
          <ProfileForm fullName={ctx.profile.full_name} email={ctx.profile.email} />
        </Section>
      )}

      {tab === "beosztas" && (
        <>
          <Section
            icon={Repeat}
            title="Heti rutin"
            description={`Mikor vagy bent és mikor otthon a(z) ${ctx.company.name} csapatban. Egy-egy napot a naptárban bármikor felülírhatsz.`}
          >
            <RecurringPatternForm initial={pattern} />
          </Section>
          <Section
            icon={Clock}
            title="Munkaidő és ebédszünet"
            description="Nem kötelező. Ha megadod, a kollégák látják a naptárban, mikor érhetnek el, és mikor ebédelsz."
          >
            {v2 ? <WorkHoursForm initial={workHours} lunchMinutes={ctx.company.lunch_minutes} /> : <Pending />}
          </Section>
        </>
      )}

      {tab === "naptar" && (
        <Section
          icon={CalendarSync}
          title="Naptár szinkron"
          description="Másold be a linket a saját naptáradba, és a beosztásod magától megjelenik ott is."
        >
          <IcalLinks personalUrl={icalUrl} teamUrl={`${icalUrl}&team=1`} />
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <Guide title="Google Naptár">
              <li>Nyisd meg a calendar.google.com oldalt</li>
              <li>Bal oldalt: <b>Egyéb naptárak</b> → <b>+</b></li>
              <li><b>URL alapján</b> → illeszd be a linket</li>
              <li><b>Naptár hozzáadása</b></li>
            </Guide>
            <Guide title="Apple Naptár">
              <li><b>Fájl</b> → <b>Új naptár-előfizetés…</b></li>
              <li>Illeszd be a linket</li>
              <li>Automatikus frissítés: <b>Óránként</b></li>
            </Guide>
            <Guide title="Outlook">
              <li><b>Naptár hozzáadása</b></li>
              <li><b>Feliratkozás az internetről</b></li>
              <li>Illeszd be a linket → <b>Importálás</b></li>
            </Guide>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            A Google Naptár akár 12–24 óránként frissít. A link személyes, ne oszd meg másokkal.
          </p>
        </Section>
      )}

      {tab === "csapat" && (
        <>
          {isAdmin && (
            <Section icon={MailPlus} title="Meghívás" description="Írd be a kollégáid email címét, a többit elintézzük.">
              {v2 ? (
                <div className="space-y-8">
                  <InviteForm />
                  {invitations.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-display text-xl font-semibold italic">Még nem fogadták el</h3>
                      <InvitationList invitations={invitations} baseUrl={base} />
                    </div>
                  )}
                </div>
              ) : (
                <Pending />
              )}
            </Section>
          )}
          <Section
            icon={Users}
            title={`Tagok (${members.length})`}
            description={isAdmin ? "A három pont alatt adhatsz admin jogot, vagy távolíthatsz el valakit." : `A(z) ${ctx.company.name} csapat tagjai.`}
          >
            <MemberList members={members} currentUserId={ctx.userId} canManage={isAdmin} />
          </Section>
          {isAdmin && (
            <Section icon={Settings2} title="Csapat adatai" description="A csapat neve és az ebédszünet hossza.">
              <CompanyForm name={ctx.company.name} lunchMinutes={ctx.company.lunch_minutes} lunchEnabled={v2} />
            </Section>
          )}
          <Section
            icon={LogOut}
            title="Kilépés"
            description={
              members.length === 1
                ? "Te vagy az egyetlen tag: ha kilépsz, a csapat és minden adata végleg törlődik."
                : "Kilépés után nem látod a csapat naptárát, és a beosztásod törlődik innen."
            }
          >
            <LeaveTeamButton teamName={ctx.company.name} deletesTeam={members.length === 1} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-6 w-6" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Guide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-ink bg-lilac-soft p-4">
      <p className="mb-2 font-display text-lg font-semibold italic">{title}</p>
      <ol className="list-decimal space-y-1 pl-4">{children}</ol>
    </div>
  );
}

function Pending() {
  return (
    <p className="rounded-xl border-2 border-dashed border-ink bg-butter/40 px-4 py-3 text-sm">{SCHEMA_PENDING_MESSAGE}</p>
  );
}
