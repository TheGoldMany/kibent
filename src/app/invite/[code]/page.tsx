import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth";
import { dbErrorMessage, withUser } from "@/lib/db";
import { inviteCodeSchema } from "@/lib/validations";

// Session-függő oldalak: mindig kérésidőben renderelődnek (Neon Auth).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Meghívó" };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const parsed = inviteCodeSchema.safeParse({ code: rawCode });
  const code = parsed.success ? parsed.data.code : null;

  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/invite/${rawCode}`)}`);

  const error = code ? await tryJoin(ctx.userId, code, ctx.company?.name ?? null) : "Érvénytelen meghívó link.";
  if (error === null) redirect("/?welcome=1");

  return (
    <AuthShell>
      <Card className="overflow-hidden">
        <CardHeader className="border-b-2 border-ink bg-bubblegum">
          <CardTitle>Nem sikerült csatlakozni</CardTitle>
          <CardDescription className="text-[15px] text-ink">{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 pt-6">
          <Button asChild>
            <Link href={ctx.company ? "/" : "/onboarding"}>{ctx.company ? "Vissza a naptárhoz" : "Tovább"}</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

/** Csatlakozás a meghívókóddal. null = sikeres, egyébként a hibaüzenet. */
async function tryJoin(userId: string, code: string, currentCompany: string | null): Promise<string | null> {
  try {
    return await withUser(userId, async (tx) => {
      const row = await tx.one<{ name: string | null }>("select public.preview_invite($1) as name", [code]);
      const companyName = row?.name ?? null;
      if (!companyName) return "Ez a meghívó link érvénytelen vagy lejárt. Kérj újat a céged adminisztrátorától.";
      if (currentCompany && currentCompany !== companyName) {
        return `Már a(z) „${currentCompany}” cég tagja vagy. Egy fiók egyszerre csak egy céghez tartozhat.`;
      }
      await tx.query("select public.join_company($1)", [code]);
      return null;
    });
  } catch (e) {
    return dbErrorMessage(e);
  }
}
