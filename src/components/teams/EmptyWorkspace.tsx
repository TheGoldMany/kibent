import { Mail, Users } from "lucide-react";
import { CreateTeamForm } from "@/components/teams/CreateTeamForm";

/** Kezdőfelület csapat nélkül: csapat létrehozása, vagy várakozás meghívóra. */
export function EmptyWorkspace({ firstName, email }: { firstName: string; email: string }) {
  return (
    <div className="mx-auto max-w-5xl space-y-10 py-4 sm:py-8">
      <div>
        <h1 className="font-display text-5xl font-bold leading-[0.95] sm:text-7xl">
          Szia{firstName ? `, ${firstName}` : ""}!
        </h1>
        <p className="mt-4 max-w-[52ch] text-lg sm:text-xl">
          Itt még üres. Hozz létre egy csapatot, és hívd meg a kollégáidat, vagy fogadj el egy meghívót, amit kaptál.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border-2 border-ink bg-white shadow-brutal-lg">
          <div className="flex items-center gap-3 rounded-t-[14px] border-b-2 border-ink bg-butter px-6 py-5">
            <span className="grid h-11 w-11 -rotate-6 place-items-center rounded-full border-2 border-ink bg-white shadow-brutal-xs">
              <Users aria-hidden className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-3xl font-bold leading-tight">Új csapat</h2>
              <p className="text-sm">Te leszel az adminisztrátor. Később több csapatot is létrehozhatsz.</p>
            </div>
          </div>
          <div className="p-6">
            <CreateTeamForm autoFocus />
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-cornflower p-6 shadow-brutal-sm">
          <span className="grid h-11 w-11 rotate-6 place-items-center rounded-full border-2 border-ink bg-white shadow-brutal-xs">
            <Mail aria-hidden className="h-5 w-5" />
          </span>
          <h2 className="font-display text-3xl font-bold leading-tight">Meghívót vársz?</h2>
          <p className="text-[15px] leading-relaxed">
            Ha egy kolléga meghív a <span className="font-semibold">{email}</span> címre, a levélben kapott gombbal egy
            kattintással bekerülsz a csapatába.
          </p>
        </section>
      </div>
    </div>
  );
}
