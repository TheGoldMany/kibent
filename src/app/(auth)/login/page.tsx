import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForms } from "@/components/auth/LoginForms";
import { KnitWeek } from "@/components/landing/KnitWeek";
import { Logo } from "@/components/layout/Logo";
import { StatusPill } from "@/components/calendar/StatusPill";
import { getSessionContext, safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Belépés" };

const FEATURES = [
  {
    swatches: ["office", "remote"] as const,
    title: "Iroda vagy otthon, egy kattintással",
    text: "Állítsd be egyszer a heti rutinodat, és a naptár magától kitöltődik. Ha változik a terv, kattints a napra.",
  },
  {
    swatches: ["vacation_pending", "vacation"] as const,
    title: "Szabadság jóváhagyással",
    text: "Kiválasztod az időszakot, a hétvégéket kihagyjuk. Az adminisztrátor egy kattintással elfogadja vagy elutasítja.",
  },
  {
    swatches: ["sick"] as const,
    title: "Betegszabadság, diszkréten",
    text: "A kollégák csak annyit látnak, hogy beteg vagy. Az orvosi igazolást kizárólag te és az adminisztrátorok nyithatják meg.",
  },
];

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
    <div className="min-h-screen overflow-x-clip bg-cotton">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <a href="#belepes" className="text-sm font-semibold underline decoration-2 underline-offset-4 lg:hidden">
          Belépés
        </a>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hős: cím + élő heti minta balra, belépés jobbra */}
        <section className="grid gap-10 pb-16 pt-6 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14 lg:pt-10">
          <div className="space-y-8">
            <div className="space-y-5">
              <h1 className="font-display text-[clamp(3.5rem,11vw,7.5rem)] font-extrabold leading-[0.88]">
                Ki van bent ma?
              </h1>
              <p className="max-w-[34ch] text-lg leading-relaxed sm:text-xl">
                A Kibent megmutatja, ki dolgozik az irodában, ki otthonról, és ki van szabadságon. Egy pillantás a
                hétre, egy kattintás a saját napjaidra.
              </p>
            </div>
            <KnitWeek className="hidden -rotate-1 sm:block lg:max-w-[40rem]" />
          </div>

          <div id="belepes" className="scroll-mt-6 lg:pt-4">
            <div className="rounded-2xl border-2 border-ink bg-white shadow-brutal-lg lg:sticky lg:top-8">
              <div className="rounded-t-[14px] border-b-2 border-ink bg-butter px-6 py-5">
                <h2 className="font-display text-3xl font-bold">
                  {isInvite ? "Csatlakozz a csapatodhoz" : "Belépés"}
                </h2>
                <p className="mt-1 text-[15px]">
                  {isInvite
                    ? "Lépj be vagy regisztrálj, és automatikusan bekerülsz a cégbe."
                    : "Új vagy? Válaszd a Regisztrációt, és pár perc alatt kész a céged naptára."}
                </p>
              </div>
              <div className="p-6">
                <LoginForms
                  next={next}
                  initialError={params.error === "link" ? "A belépő link érvénytelen vagy lejárt. Kérj újat!" : undefined}
                />
              </div>
            </div>
          </div>

          <KnitWeek className="sm:hidden" />
        </section>

        {/* Funkciók: a naptár színei mesélik el, mit tud */}
        <section aria-labelledby="mit-tud" className="mb-16 rounded-2xl border-2 border-ink bg-lilac px-5 py-10 shadow-brutal sm:px-10">
          <h2 id="mit-tud" className="max-w-[18ch] font-display text-4xl font-bold leading-tight sm:text-5xl">
            Minden szín jelent valamit
          </h2>
          <ul className="mt-10 grid gap-x-10 gap-y-9 md:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {f.swatches.map((s) => (
                    <StatusPill key={s} status={s} className="border-2 border-ink bg-clip-padding px-2.5 py-1 text-[13px] shadow-brutal-xs" />
                  ))}
                </div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="leading-relaxed">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-16 grid items-center gap-6 rounded-2xl border-2 border-ink bg-cornflower px-5 py-8 shadow-brutal sm:px-10 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-3xl font-bold">A saját naptáradban is</h2>
            <p className="mt-2 max-w-[56ch] leading-relaxed">
              Élő naptár linket kapsz a Google Naptárhoz, az Apple Naptárhoz és az Outlookhoz. Ha kéred, a kollégáid
              irodai napjait is mutatja.
            </p>
          </div>
          <a href="#belepes" className="press inline-flex h-12 items-center justify-center rounded-full border-2 border-ink bg-white px-7 font-semibold font-wide shadow-brutal-sm">
            Kipróbálom ingyen
          </a>
        </section>
      </main>

      <footer className="border-t-2 border-ink bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm sm:px-6">
          <Logo />
          <p>Csapatnaptár hibrid és remote csapatoknak. Ingyenes.</p>
        </div>
      </footer>
    </div>
  );
}
