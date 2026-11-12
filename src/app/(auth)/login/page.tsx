import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForms } from "@/components/auth/LoginForms";
import { getSessionContext, safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Bejelentkezés" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getSessionContext()) redirect(next);

  const isInvite = next.startsWith("/invite/");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isInvite ? "Csatlakozz a csapatodhoz" : "Üdv a Kibentben!"}</CardTitle>
        <CardDescription>
          {isInvite
            ? "Lépj be vagy regisztrálj, és automatikusan bekerülsz a cégbe."
            : "Ki van bent ma az irodában? Lépj be, és nézd meg."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForms
          next={next}
          initialError={params.error === "link" ? "A link érvénytelen vagy lejárt. Kérj újat!" : undefined}
        />
      </CardContent>
    </Card>
  );
}
