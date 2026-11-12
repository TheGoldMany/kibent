import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForms } from "@/components/auth/OnboardingForms";
import { getSessionContext } from "@/lib/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Kezdés" };

export default async function OnboardingPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login?next=/onboarding");
  if (ctx.company) redirect("/");

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Szia, {ctx.profile.full_name.split(" ")[0]}! 👋</h1>
        <p className="mt-1 text-muted-foreground">Már csak egy lépés: hozz létre egy céget, vagy csatlakozz egyhez.</p>
      </div>
      <OnboardingForms />
      <form action={signOutAction} className="text-center">
        <Button variant="link" size="sm" type="submit" className="text-muted-foreground">
          Kijelentkezés ({ctx.profile.email})
        </Button>
      </form>
    </div>
  );
}
