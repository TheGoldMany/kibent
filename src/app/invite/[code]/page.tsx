import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inviteCodeSchema } from "@/lib/validations";
import { friendlyError } from "@/lib/utils";

export const metadata: Metadata = { title: "Meghívó" };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const parsed = inviteCodeSchema.safeParse({ code: rawCode });
  const code = parsed.success ? parsed.data.code : null;

  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/invite/${rawCode}`)}`);

  let error: string | null = code ? null : "Érvénytelen meghívó link.";
  let companyName: string | null = null;

  if (code) {
    const supabase = await createClient();
    const { data: name } = await supabase.rpc("preview_invite", { code });
    companyName = name ?? null;

    if (!companyName) {
      error = "Ez a meghívó link érvénytelen vagy lejárt. Kérj újat a céged adminisztrátorától.";
    } else if (ctx.company && ctx.company.name !== companyName) {
      error = `Már a(z) „${ctx.company.name}” cég tagja vagy. Egy fiók egyszerre csak egy céghez tartozhat.`;
    } else {
      const { error: joinError } = await supabase.rpc("join_company", { code });
      if (joinError) {
        error = friendlyError(joinError);
      } else {
        redirect("/?welcome=1");
      }
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-background p-4">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Nem sikerült csatlakozni</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild>
            <Link href={ctx.company ? "/" : "/onboarding"}>{ctx.company ? "Vissza a naptárhoz" : "Tovább"}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
