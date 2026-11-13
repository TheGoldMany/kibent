import { Logo } from "@/components/layout/Logo";
import { SlimFooter } from "@/components/layout/SiteFooter";
import { MainNav } from "@/components/layout/MainNav";
import { InviteButton } from "@/components/layout/InviteButton";
import { UserMenu } from "@/components/layout/UserMenu";
import { TeamSwitcher } from "@/components/teams/TeamSwitcher";
import { requireSession } from "@/lib/auth";

// Session-függő oldalak: mindig kérésidőben renderelődnek.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  const hasTeam = !!ctx.company;
  const isAdmin = hasTeam && ctx.profile.role === "admin";
  const pendingCount = isAdmin ? ctx.pendingCount : 0;

  return (
    <div className="flex min-h-screen flex-col bg-cotton">
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-white">
        <div className="mx-auto flex h-[4.5rem] max-w-[1600px] items-center gap-2 px-3 sm:gap-4 sm:px-6 lg:px-10">
          <Logo compact />
          <TeamSwitcher teams={ctx.teams} activeId={ctx.company?.id ?? null} />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {hasTeam && <MainNav pendingCount={pendingCount} />}
            {isAdmin && <InviteButton />}
            <UserMenu
              fullName={ctx.profile.full_name}
              email={ctx.profile.email}
              isAdmin={isAdmin}
              companyName={ctx.company?.name ?? null}
              hasTeam={hasTeam}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-8 sm:px-6 sm:py-10 lg:px-10">{children}</main>
      <SlimFooter />
    </div>
  );
}
