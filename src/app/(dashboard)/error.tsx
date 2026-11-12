"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-ink bg-bubblegum p-10 text-center shadow-brutal">
      <p className="text-4xl">😕</p>
      <h2 className="font-display text-3xl font-bold">Hiba történt</h2>
      <p className="max-w-md text-sm">{error.message || "Próbáld újra egy kicsit később."}</p>
      <Button onClick={reset}>Újrapróbálás</Button>
    </div>
  );
}
