import { Logo } from "@/components/layout/Logo";
import { KibentMark } from "@/components/brand/KibentMark";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const LUNDA_URL = "https://lundasoftware.hu";

function LundaLink({ className }: { className?: string }) {
  return (
    <a
      href={LUNDA_URL}
      target="_blank"
      rel="noopener"
      className={cn("inline-flex items-center gap-1 font-semibold underline decoration-2 underline-offset-4", className)}
    >
      Lunda Software
      <ArrowUpRight aria-hidden strokeWidth={2.25} className="h-4 w-4" />
      <span className="sr-only">(új lapon nyílik meg)</span>
    </a>
  );
}

/** Keskeny lábléc az alkalmazás belső oldalaira. */
export function SlimFooter() {
  return (
    <footer className="border-t-2 border-ink bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-3 py-5 text-sm sm:px-6 lg:px-10">
        <p className="flex items-center gap-2">
          <KibentMark className="h-7 w-7" />
          <span>
            <span className="font-display text-base font-bold italic">Kibent</span>, csapatnaptár hibrid csapatoknak
          </span>
        </p>
        <p>
          Készítette: <LundaLink />
        </p>
      </div>
    </footer>
  );
}

/** A nyilvános oldal (belépő/landing) lábléce. */
export function SiteFooter({ links }: { links: { href: string; label: string }[] }) {
  const year = new Date().getFullYear();
  return (
    <footer className="overflow-hidden border-t-2 border-ink bg-ink text-cotton">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 pb-12 pt-20 sm:px-8 md:grid-cols-[1.3fr_0.7fr_1fr] lg:px-12">
        <div className="space-y-5">
          <Logo href="/login" size="lg" variant="dark" />
          <p className="max-w-[22ch] font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Hétfőn bent, kedden otthon, pénteken a Balatonon.
          </p>
        </div>

        <nav aria-label="Lábléc navigáció">
          <h2 className="mb-4 font-display text-lg italic text-lilac">Az oldalon</h2>
          <ul className="space-y-2.5">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-[15px] decoration-butter decoration-2 underline-offset-4 hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="mb-4 font-display text-lg italic text-lilac">Készítette</h2>
          <a
            href={LUNDA_URL}
            target="_blank"
            rel="noopener"
            className="group block rotate-1 rounded-2xl border-2 border-cotton bg-butter p-5 text-ink shadow-[6px_6px_0_0_#FFB9DA] transition-transform hover:rotate-0 active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="font-display text-3xl font-bold leading-none">Lunda Software</span>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-white transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                <ArrowUpRight aria-hidden strokeWidth={2.25} className="h-5 w-5" />
              </span>
            </span>
            <span className="mt-3 block text-[15px]">
              A Kibentet a Lunda Software tervezi és fejleszti.
            </span>
            <span className="mt-4 inline-block rounded-full border-2 border-ink bg-white px-3 py-1 text-sm font-semibold">
              lundasoftware.hu
            </span>
            <span className="sr-only">(új lapon nyílik meg)</span>
          </a>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 border-t border-cotton/25 px-5 py-6 text-sm text-cotton/80 sm:px-8 lg:px-12">
        <p>© {year} Kibent. Ingyenes csapatnaptár hibrid és remote csapatoknak.</p>
      </div>

      {/* Divatmagazin-fejléc: óriási, alul levágott szómárka */}
      <div aria-hidden className="pointer-events-none select-none px-2">
        <p className="-mb-[0.32em] text-center font-display text-[clamp(6rem,27vw,22rem)] font-extrabold italic leading-none text-butter">
          Kibent
        </p>
      </div>
    </footer>
  );
}
