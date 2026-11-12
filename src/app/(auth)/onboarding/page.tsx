import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForms } from "@/components/auth/OnboardingForms";
import { getSessionContext } from "@/lib/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/layout/AuthShell";

export const metadata: Metadata = { title: "Kezdés" };

export default async function OnboardingPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login?next=/onboarding");
  if (ctx.company) redirect("/");

  return (
    <AuthShell>
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-5xl font-bold leading-[0.95]">Szia, {ctx.profile.full_name.split(" ")[0]}!</h1>
        <p className="mt-3 text-lg">Már csak egy lépés: hozz létre egy céget, vagy csatlakozz a csapatodhoz.</p>
      </div>
      <OnboardingForms />
      <form action={signOutAction} className="text-center">
        <Button variant="link" size="sm" type="submit" className="text-muted-foreground">
          Kijelentkezés ({ctx.profile.email})
        </Button>
      </form>
    </div>
    </AuthShell>
  );
}
