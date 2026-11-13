import { Check } from "lucide-react";
import { RecurringPatternModal } from "@/components/calendar/RecurringPatternModal";
import { InviteButton } from "@/components/layout/InviteButton";
import { cn } from "@/lib/utils";

/** Első lépések: addig látszik a naptár fölött, amíg nincs heti rutin, illetve egyedül vagy a csapatban. */
export function GettingStarted({
  teamName,
  hasPattern,
  showInvite,
  hasColleagues,
}: {
  teamName: string;
  hasPattern: boolean;
  /** Csak admin hívhat meg. */
  showInvite: boolean;
  hasColleagues: boolean;
}) {
  return (
    <section aria-label="Első lépések" className="overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-brutal-sm">
      <div className="border-b-2 border-ink bg-butter px-5 py-3">
        <h2 className="font-display text-2xl font-bold">Üdv a(z) {teamName} csapatban!</h2>
      </div>
      <ol className="divide-y-2 divide-ink/10">
        <Step n={1} done={hasPattern} title="Állítsd be a heti rutinodat" text="Mely napokon vagy bent, és mikor otthon. Egyszer kell megadni, a naptár minden hétre kitöltődik.">
          <RecurringPatternModal initial={null} triggerProps={{ variant: "default", size: "sm" }} />
        </Step>
        {showInvite && (
          <Step n={2} done={hasColleagues} title="Hívd meg a kollégáidat" text="Csak az email címük kell. Egy kattintással csatlakoznak.">
            <InviteButton showLabel />
          </Step>
        )}
      </ol>
    </section>
  );
}

function Step({ n, done, title, text, children }: { n: number; done: boolean; title: string; text: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink text-sm font-bold",
          done ? "bg-emerald-200" : "bg-lilac",
        )}
      >
        {done ? <Check aria-label="Kész" className="h-4 w-4" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-[12rem] flex-1">
        <p className={cn("font-semibold", done && "line-through decoration-2")}>{title}</p>
        {!done && <p className="text-sm text-muted-foreground">{text}</p>}
      </div>
      {!done && children}
    </li>
  );
}
