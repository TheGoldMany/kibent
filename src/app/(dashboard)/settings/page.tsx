import type { Metadata } from "next";
import { CalendarSync, Building2, Clock, MailPlus, Repeat, User, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RecurringPatternForm } from "@/components/calendar/RecurringPatternModal";
import { CompanyForm, IcalLinks, MemberList, ProfileForm } from "@/components/settings/SettingsForms";
import { WorkHoursForm } from "@/components/settings/WorkHoursForm";
import { InviteForm } from "@/components/invites/InviteForm";
import { InvitationList } from "@/components/invites/InvitationList";
import { requireMember } from "@/lib/auth";
import { withUser } from "@/lib/db";
import type { CompanyInvitation, Role, WorkHours } from "@/lib/database.types";
import type { PatternDays } from "@/lib/schedule-resolver";
import { siteUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Beállítások" };

export default async function SettingsPage() {
  const ctx = await requireMember();
  const isAdmin = ctx.profile.role === "admin";
  // Egyetlen adatbázis-kör
  const data = await withUser(ctx.userId, (tx) =>
    tx.one<{
      pattern: PatternDays | null;
      members: { id: string; full_name: string; email: string; role: Role }[];
      work_hours: WorkHours[];
      invitations: CompanyInvitation[];
    }>(
      `select
         (select json_build_object('mon', mon, 'tue', tue, 'wed', wed, 'thu', thu, 'fri', fri)
            from recurring_patterns where user_id = $1) as pattern,
         coalesce((select json_agg(json_build_object('id', id, 'full_name', full_name, 'email', email, 'role', role))
                     from profiles where $3 and company_id = $2), '[]') as members,
         coalesce((select json_agg(json_build_object('user_id', user_id, 'weekday', weekday, 'start_time', start_time,
                                                     'end_time', end_time, 'lunch_start', lunch_start) order by weekday)
                     from work_hours where user_id = $1), '[]') as work_hours,
         -- RLS: csak admin látja (member esetén üres)
         coalesce((select json_agg(json_build_object('id', id, 'email', email, 'token', token, 'created_at', created_at,
                                                     'expires_at', expires_at, 'accepted_at', accepted_at)
                                   order by created_at desc)
                     from company_invitations where $3 and company_id = $2 and accepted_at is null), '[]') as invitations`,
      [ctx.userId, ctx.company.id, isAdmin],
    ),
  );
  const pattern = data?.pattern ?? null;
  const workHours = data?.work_hours ?? [];
  const invitations = data?.invitations ?? [];
  const rawMembers = data?.members ?? [];

  const base = siteUrl();
  const icalUrl = `${base}/api/ical/${ctx.profile.ical_token}/calendar.ics`;
  const collator = new Intl.Collator("hu");
  const members = [...rawMembers].sort((a, b) => collator.compare(a.full_name, b.full_name));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-5xl font-bold leading-none sm:text-6xl">Beállítások</h1>
        <p className="mt-3 text-lg">Profil, heti rutin, naptár szinkron{isAdmin && " és cégbeállítások"}.</p>
      </div>

      <Section icon={User} title="Profil" description="A neved így jelenik meg a kollégáid naptárában.">
        <ProfileForm fullName={ctx.profile.full_name} email={ctx.profile.email} />
      </Section>

      <Section
        icon={Repeat}
        title="Ismétlődő heti rutin"
        description="Az alapértelmezett heti beosztásod. Egy-egy napot a naptárban bármikor felülírhatsz."
      >
        <RecurringPatternForm initial={pattern} />
      </Section>

      <Section
        icon={Clock}
        title="Munkaidő és ebédszünet"
        description="Mikor dolgozol, és mikor ebédelsz. A kollégák a naptárban látják, ha éppen ebédszüneten vagy."
      >
        <WorkHoursForm initial={workHours} lunchMinutes={ctx.company.lunch_minutes} />
      </Section>

      <Section
        icon={CalendarSync}
        title="Naptár szinkronizáció"
        description="Élő naptár feed (.ics), amely automatikusan frissül a Google Naptárban, Apple Naptárban vagy Outlookban."
      >
        <IcalLinks personalUrl={icalUrl} teamUrl={`${icalUrl}?team=1`} />
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
          A feed az előző hónap elejétől a következő 3 hónap végéig tartalmazza az eseményeket. A Google Naptár akár 12–24
          óránként frissít. A link személyes – ne oszd meg másokkal.
        </p>
      </Section>

      {isAdmin && (
        <>
          <Section icon={Building2} title="Cégbeállítások" description="Cégnév és az ebédszünet hossza.">
            <CompanyForm name={ctx.company.name} lunchMinutes={ctx.company.lunch_minutes} />
          </Section>
          <Section
            icon={MailPlus}
            title="Meghívások"
            description="A meghívott kollégák a levélben kapott linkkel regisztrálnak, és belépés után automatikusan a csapatban lesznek."
          >
            <div className="space-y-8">
              <InviteForm />
              <div className="space-y-3">
                <h3 className="font-display text-xl font-semibold italic">Függő meghívók</h3>
                <InvitationList invitations={invitations} baseUrl={base} />
              </div>
            </div>
          </Section>
          <Section icon={Users} title={`Tagok (${members.length})`} description="Szerepkörök és tagság kezelése.">
            <MemberList members={members} currentUserId={ctx.userId} />
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
