import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-cotton p-6 text-center">
      <span className="grid h-20 w-20 -rotate-6 place-items-center rounded-full border-2 border-ink bg-butter shadow-brutal-sm">
        <Compass aria-hidden strokeWidth={2} className="h-10 w-10" />
      </span>
      <h1 className="font-display text-5xl font-bold">Az oldal nem található</h1>
      <p className="text-muted-foreground">Lehet, hogy a link elavult vagy elírás történt.</p>
      <Button asChild>
        <Link href="/">Vissza a naptárhoz</Link>
      </Button>
    </main>
  );
}
