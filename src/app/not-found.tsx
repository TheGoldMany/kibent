import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-cotton p-6 text-center">
      <p className="text-5xl">🧭</p>
      <h1 className="font-display text-5xl font-bold">Az oldal nem található</h1>
      <p className="text-muted-foreground">Lehet, hogy a link elavult vagy elírás történt.</p>
      <Button asChild>
        <Link href="/">Vissza a naptárhoz</Link>
      </Button>
    </main>
  );
}
