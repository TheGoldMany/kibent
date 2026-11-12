import { Logo } from "@/components/layout/Logo";
import { MainNav } from "@/components/layout/MainNav";
import { InviteButton } from "@/components/layout/InviteButton";
import { UserMenu } from "@/components/layout/UserMenu";
import { requireMember } from "@/lib/auth";
import { countPendingRequests } from "@/lib/queries";
import { siteUrl } from "@/lib/utils";

// Session-függő oldalak: mindig kérésidőben renderelődnek (Neon Auth).
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireMember();
  const isAdmin = ctx.profile.role === "admin";
  const pendingCount = isAdmin ? await countPendingRequests(ctx.userId, ctx.company.id) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-cotton">
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-white">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-3 sm:gap-4 sm:px-4">
          <Logo />
          <span className="hidden truncate font-display text-lg italic lg:inline">{ctx.company.name}</span>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <MainNav pendingCount={pendingCount} />
            {isAdmin && <InviteButton inviteUrl={`${siteUrl()}/invite/${ctx.company.invite_code}`} />}
            <UserMenu
              fullName={ctx.profile.full_name}
              email={ctx.profile.email}
              isAdmin={isAdmin}
              companyName={ctx.company.name}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-6 sm:px-4 sm:py-8">{children}</main>
    </div>
  );
}
