"use client";

import { useActionState } from "react";
import { Building2, UserPlus } from "lucide-react";
import { createCompanyAction } from "@/app/(auth)/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

export function OnboardingForms({ email }: { email: string }) {
  const [createState, create] = useActionState(createCompanyAction, null);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader className="border-b-2 border-ink bg-butter">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Új cég létrehozása
          </CardTitle>
          <CardDescription>Te leszel az adminisztrátor, és meghívhatod a kollégáidat.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="name">Cég neve</Label>
              <Input id="name" name="name" placeholder="pl. Példa Kft." required minLength={2} maxLength={120} />
            </div>
            <FormMessage state={createState} />
            <SubmitButton className="w-full" pendingText="Létrehozás…">
              Cég létrehozása
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border-2 border-ink bg-cornflower p-5 shadow-brutal-sm">
        <UserPlus aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold">Csatlakoznál a csapatodhoz?</h2>
          <p className="text-[15px] leading-relaxed">
            Kérd meg a céged adminisztrátorát, hogy hívjon meg erre a címre: <span className="font-semibold">{email}</span>.
            A levélben kapott linkkel, vagy a következő belépéskor automatikusan bekerülsz.
          </p>
        </div>
      </div>
    </div>
  );
}
