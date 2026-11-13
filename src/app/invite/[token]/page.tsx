import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { AcceptInviteForm } from "@/components/teams/AcceptInviteForm";
import { Button } from "@/components/ui/button";
import { signOutAction, switchTeamAction } from "@/app/(auth)/actions";
import { getSessionContext } from "@/lib/auth";
import { getInvitePreview } from "@/lib/invitations";

// Session-függő oldal: mindig kérésidőben renderelődik.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Meghívó" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvitePreview(token);
  const ctx = await getSessionContext();

  if (!invite) return <Problem text="Ez a meghívó link érvénytelen. Kérj újat a csapat adminisztrátorától." loggedIn={!!ctx} />;

  const alreadyMember = !!ctx?.teams.some((t) => t.id === invite.companyId);
  if (!alreadyMember) {
    if (invite.accepted) return <Problem text="Ezt a meghívót már felhasználták." loggedIn={!!ctx} />;
    if (invite.expired) return <Problem text="Ez a meghívó lejárt. Kérj újat a csapat adminisztrátorától." loggedIn={!!ctx} />;
  }
  // Nincs belépve: belépés / regisztráció, utána automatikusan csatlakozik.
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const otherAccount = ctx.profile.email.toLowerCase() !== invite.email;

  return (
    <AuthShell>
      <div className="overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-brutal-lg">
        <div className="flex items-start gap-3 border-b-2 border-ink bg-butter px-6 py-6">
          <span className="grid h-12 w-12 shrink-0 -rotate-6 place-items-center rounded-full border-2 border-ink bg-white shadow-brutal-xs">
            <Users aria-hidden className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold">Meghívó</p>
            <h1 className="font-display text-4xl font-bold leading-tight">{invite.companyName}</h1>
          </div>
        </div>
        <div className="space-y-5 p-6">
          {alreadyMember ? (
            <>
              <p className="text-[15px]">Már tagja vagy ennek a csapatnak.</p>
              <form action={switchTeamAction}>
                <input type="hidden" name="teamId" value={invite.companyId} />
                <Button type="submit" size="lg" className="w-full">
                  Tovább a csapathoz
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-[15px]">
                {otherAccount ? (
                  <>
                    A meghívó a <span className="font-semibold">{invite.email}</span> címre szólt, de most{" "}
                    <span className="font-semibold">{ctx.profile.email}</span> néven vagy belépve. Ezzel a fiókkal is
                    csatlakozhatsz.
                  </>
                ) : (
                  <>Fogadd el, és már bent is vagy a csapatban.</>
                )}
              </p>
              <AcceptInviteForm token={token} />
              {otherAccount && (
                <form action={signOutAction}>
                  <Button type="submit" variant="link" className="w-full">
                    Kijelentkezés és belépés a meghívott címmel
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </AuthShell>
  );
}

function Problem({ text, loggedIn }: { text: string; loggedIn: boolean }) {
  return (
    <AuthShell>
      <div className="overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-brutal-lg">
        <div className="border-b-2 border-ink bg-bubblegum px-6 py-6">
          <h1 className="font-display text-3xl font-bold">Nem sikerült csatlakozni</h1>
          <p className="mt-2 text-[15px]">{text}</p>
        </div>
        <div className="p-6">
          <Button asChild>
            <Link href={loggedIn ? "/" : "/login"}>Tovább</Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
