import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Supabase/PostgREST hibákból felhasználóbarát magyar üzenet. */
export function friendlyError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "Ismeretlen hiba történt.";
  if (error.code === "42501" && error.message?.includes("row-level security")) {
    return "Nincs jogosultságod ehhez a művelethez.";
  }
  // A saját triggereink/RPC-ink már magyar üzenetet adnak.
  return error.message || "Ismeretlen hiba történt.";
}
