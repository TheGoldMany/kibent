import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForms } from "@/components/auth/LoginForms";
import { KnitWeek } from "@/components/landing/KnitWeek";
import { Marquee } from "@/components/landing/Marquee";
import { Logo } from "@/components/layout/Logo";
import { SiteFooter } from "@/components/layout/SiteFooter";
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
      <header className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-5 py-6 sm:px-8 lg:px-12">
        <Logo size="lg" />
        <nav aria-label="Fő navigáció" className="flex items-center gap-6 text-[15px] font-semibold">
          <a href="#mit-tud-blokk" className="hidden underline-offset-4 hover:underline md:inline">
            Mit tud?
          </a>
          <a href="#naptar-szinkron" className="hidden underline-offset-4 hover:underline md:inline">
            Naptár szinkron
          </a>
          <a
            href="#belepes"
            className="press inline-flex h-11 items-center rounded-full border-2 border-ink bg-white px-5 font-wide shadow-brutal-xs lg:hidden"
          >
            Belépés
          </a>
        </nav>
      </header>

      <main className="pb-10">
        {/* Hős: cím + élő heti minta balra, belépés jobbra */}
        <section className="mx-auto grid max-w-[1440px] gap-12 px-5 pb-6 pt-6 sm:px-8 lg:grid-cols-[1.25fr_0.75fr] lg:gap-16 lg:px-12 lg:pt-12 xl:gap-24">
          <div className="space-y-10">
            <div className="space-y-6">
              <h1 className="font-display text-[clamp(4rem,11vw,9.5rem)] font-extrabold leading-[0.86]">
                Ki van bent ma?
              </h1>
              <p className="max-w-[32ch] text-xl leading-relaxed sm:text-2xl">
                A Kibent megmutatja, ki dolgozik az irodában, ki otthonról, és ki van szabadságon. Egy pillantás a
                hétre, egy kattintás a saját napjaidra.
              </p>
            </div>
            <KnitWeek className="hidden -rotate-1 sm:block" />
          </div>

          <div id="belepes" className="scroll-mt-6 lg:pt-6">
            <div className="relative rounded-2xl border-2 border-ink bg-white shadow-brutal-lg lg:sticky lg:top-8">
              {/* Matrica a sarokban */}
              <span
                aria-hidden
                className="absolute -top-8 right-3 z-10 grid h-20 w-20 rotate-12 place-items-center rounded-full border-2 border-ink bg-bubblegum text-center shadow-brutal-sm sm:-right-6 sm:-top-6 sm:h-28 sm:w-28"
              >
                <span className="leading-none">
                  <span className="block font-display text-lg font-bold italic sm:text-2xl">Ingyenes</span>
                  <span className="mt-1 block text-[10px] font-semibold sm:text-xs">csapatoknak</span>
                </span>
              </span>
              <div className="rounded-t-[14px] border-b-2 border-ink bg-butter px-6 py-6 pr-24 sm:px-8 sm:pr-28">
                <h2 className="font-display text-4xl font-bold">
                  {isInvite ? "Csatlakozz a csapatodhoz" : "Belépés"}
                </h2>
                <p className="mt-2 text-base">
                  {isInvite
                    ? "Lépj be vagy regisztrálj, és automatikusan bekerülsz a cégbe."
                    : "Új vagy? Válaszd a Regisztrációt, és pár perc alatt kész a céged naptára."}
                </p>
              </div>
              <div className="p-6 sm:p-8">
                <LoginForms
                  next={next}
                  initialError={params.error === "link" ? "A belépő link érvénytelen vagy lejárt. Kérj újat!" : undefined}
                />
              </div>
            </div>
          </div>

          <KnitWeek className="sm:hidden" />
        </section>

        <Marquee />

        <div className="mx-auto max-w-[1440px] space-y-16 px-5 pt-6 sm:px-8 lg:space-y-24 lg:px-12">
          {/* Funkciók: a naptár színei mesélik el, mit tud */}
          <section
            id="mit-tud-blokk"
            aria-labelledby="mit-tud"
            className="scroll-mt-6 rounded-2xl border-2 border-ink bg-lilac px-6 py-12 shadow-brutal-lg sm:px-12 lg:px-16 lg:py-16"
          >
            <h2 id="mit-tud" className="max-w-[16ch] font-display text-5xl font-bold leading-[0.95] sm:text-6xl lg:text-7xl">
              Minden szín jelent valamit
            </h2>
            <ul className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {f.swatches.map((s) => (
                      <StatusPill key={s} status={s} className="border-2 border-ink px-3 py-1.5 text-sm shadow-brutal-xs" />
                    ))}
                  </div>
                  <h3 className="text-xl font-bold lg:text-2xl">{f.title}</h3>
                  <p className="text-lg leading-relaxed">{f.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section
            id="naptar-szinkron"
            className="grid scroll-mt-6 items-center gap-8 rounded-2xl border-2 border-ink bg-cornflower px-6 py-10 shadow-brutal-lg sm:px-12 md:grid-cols-[1fr_auto] lg:px-16 lg:py-14"
          >
            <div>
              <h2 className="font-display text-4xl font-bold sm:text-5xl">A saját naptáradban is</h2>
              <p className="mt-3 max-w-[56ch] text-lg leading-relaxed">
                Élő naptár linket kapsz a Google Naptárhoz, az Apple Naptárhoz és az Outlookhoz. Ha kéred, a kollégáid
                irodai napjait is mutatja.
              </p>
            </div>
            <a
              href="#belepes"
              className="press inline-flex h-14 items-center justify-center rounded-full border-2 border-ink bg-white px-8 text-lg font-semibold font-wide shadow-brutal-sm"
            >
              Kipróbálom ingyen
            </a>
          </section>
        </div>
      </main>

      <SiteFooter
        links={[
          { href: "#belepes", label: "Belépés és regisztráció" },
          { href: "#mit-tud-blokk", label: "Mit tud a Kibent?" },
          { href: "#naptar-szinkron", label: "Naptár szinkron" },
        ]}
      />
    </div>
  );
}
