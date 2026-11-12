"use client";

import { useActionState } from "react";
import { Building2, UserPlus } from "lucide-react";
import { createCompanyAction, joinCompanyAction } from "@/app/(auth)/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

export function OnboardingForms() {
  const [createState, create] = useActionState(createCompanyAction, null);
  const [joinState, join] = useActionState(joinCompanyAction, null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Új cég létrehozása
          </CardTitle>
          <CardDescription>Te leszel az adminisztrátor, és meghívhatod a kollégáidat.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="space-y-4">
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

      <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> vagy <span className="h-px flex-1 bg-border" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Csatlakozás meghívókóddal
          </CardTitle>
          <CardDescription>A kódot a céged adminisztrátorától kapod (8 karakter).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={join} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Meghívókód</Label>
              <Input
                id="code"
                name="code"
                placeholder="pl. AB12CD34"
                required
                maxLength={8}
                autoCapitalize="characters"
                className="font-mono uppercase tracking-widest"
              />
            </div>
            <FormMessage state={joinState} />
            <SubmitButton variant="secondary" className="w-full" pendingText="Csatlakozás…">
              Csatlakozás
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
