import { Sparkle } from "lucide-react";

const PHRASES = [
  "Hétfőn bent",
  "Kedden otthonról",
  "Szerdán csapatebéd",
  "Csütörtökön mindenki bent",
  "Pénteken a Balatonon",
  "Hétvégén kikapcsolva",
];

function Track({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {PHRASES.map((p) => (
        <li key={p} className="flex items-center">
          <span className="whitespace-nowrap px-6 font-display text-3xl font-semibold italic sm:text-4xl">{p}</span>
          <Sparkle aria-hidden strokeWidth={1.5} className="h-6 w-6 shrink-0 fill-bubblegum text-bubblegum" />
        </li>
      ))}
    </ul>
  );
}

/** Divatmárkás, ferdén futó szalag a hét ritmusával. Mozgáscsökkentésnél áll. */
export function Marquee() {
  return (
    <div className="relative z-10 -mx-4 py-6 sm:py-10" role="presentation">
      <div className="marquee -rotate-2 overflow-hidden border-y-2 border-ink bg-ink py-4 text-butter shadow-brutal">
        <div className="marquee-track flex w-max">
          <Track />
          <Track hidden />
        </div>
      </div>
    </div>
  );
}
