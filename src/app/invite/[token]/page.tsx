import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/app/(auth)/actions";
import { getSessionContext } from "@/lib/auth";
import { dbErrorMessage, withUser } from "@/lib/db";
import { getInvitePreview } from "@/lib/invitations";

// Session-függő oldal: mindig kérésidőben renderelődik (Neon Auth).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Meghívó" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvitePreview(token);
  const ctx = await getSessionContext();

  let error: string | null = null;
  let wrongAccount = false;

  if (!invite) {
    error = "Ez a meghívó link érvénytelen. Kérj újat a céged adminisztrátorától.";
  } else if (ctx?.company?.id === invite.companyId) {
    // Már a csapat tagja (pl. belépéskor automatikusan csatlakozott).
    redirect("/?welcome=1");
  } else if (invite.accepted) {
    error = "Ezt a meghívót már felhasználták.";
  } else if (invite.expired) {
    error = "Ez a meghívó lejárt. Kérj újat a céged adminisztrátorától.";
  } else if (!ctx) {
    // Nincs belépve: a belépő oldal a token alapján kitölti az email címet.
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  } else {
    error = await accept(ctx.userId, token);
    if (error === null) redirect("/?welcome=1");
    wrongAccount = ctx.profile.email.toLowerCase() !== invite.email;
  }

  return (
    <AuthShell>
      <Card className="overflow-hidden">
        <CardHeader className="border-b-2 border-ink bg-bubblegum">
          <CardTitle>Nem sikerült csatlakozni</CardTitle>
          <CardDescription className="text-[15px] text-ink">{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-6">
          {wrongAccount ? (
            <form action={signOutAction}>
              <Button type="submit">Kijelentkezés és belépés másik címmel</Button>
            </form>
          ) : (
            <Button asChild>
              <Link href={ctx?.company ? "/" : ctx ? "/onboarding" : "/login"}>Tovább</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}

async function accept(userId: string, token: string): Promise<string | null> {
  try {
    await withUser(userId, (tx) => tx.query("select public.accept_invitation($1)", [token]));
    return null;
  } catch (e) {
    return dbErrorMessage(e);
  }
}
