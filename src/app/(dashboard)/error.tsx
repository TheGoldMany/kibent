"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-ink bg-bubblegum p-10 text-center shadow-brutal">
      <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-ink bg-white shadow-brutal-xs">
        <TriangleAlert aria-hidden strokeWidth={2} className="h-8 w-8" />
      </span>
      <h2 className="font-display text-3xl font-bold">Hiba történt</h2>
      <p className="max-w-md text-sm">{error.message || "Próbáld újra egy kicsit később."}</p>
      <Button onClick={reset}>Újrapróbálás</Button>
    </div>
  );
}
