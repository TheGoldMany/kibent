"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <p className="text-4xl">😕</p>
      <h2 className="text-lg font-semibold">Hiba történt</h2>
      <p className="max-w-md text-sm text-muted-foreground">{error.message || "Próbáld újra egy kicsit később."}</p>
      <Button onClick={reset}>Újrapróbálás</Button>
    </div>
  );
}
