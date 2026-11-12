import type { Metadata } from "next";
import { CalendarSync, Building2, Repeat, User, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RecurringPatternForm } from "@/components/calendar/RecurringPatternModal";
import { CompanyForm, IcalLinks, MemberList, ProfileForm } from "@/components/settings/SettingsForms";
import { requireMember } from "@/lib/auth";
import { withUser } from "@/lib/db";
import type { Role } from "@/lib/database.types";
import type { PatternDays } from "@/lib/schedule-resolver";
import { siteUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Beállítások" };

export default async function SettingsPage() {
  const ctx = await requireMember();
  const isAdmin = ctx.profile.role === "admin";
  const { pattern, rawMembers } = await withUser(ctx.userId, async (tx) => ({
    pattern: await tx.one<PatternDays>("select mon, tue, wed, thu, fri from recurring_patterns where user_id = $1", [
      ctx.userId,
    ]),
    rawMembers: isAdmin
      ? await tx.query<{ id: string; full_name: string; email: string; role: Role }>(
          "select id, full_name, email, role from profiles where company_id = $1",
          [ctx.company.id],
        )
      : [],
  }));

  const base = siteUrl();
  const icalUrl = `${base}/api/ical/${ctx.profile.ical_token}/calendar.ics`;
  const collator = new Intl.Collator("hu");
  const members = [...rawMembers].sort((a, b) => collator.compare(a.full_name, b.full_name));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl">Beállítások</h1>
        <p className="mt-2 text-[15px]">Profil, heti rutin, naptár szinkron{isAdmin && " és cégbeállítások"}.</p>
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
          <Section icon={Building2} title="Cégbeállítások" description="Cégnév és meghívó link kezelése.">
            <CompanyForm name={ctx.company.name} inviteUrl={`${base}/invite/${ctx.company.invite_code}`} />
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
