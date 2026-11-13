import { redirect } from "next/navigation";

/** Régi útvonal: a csapat létrehozása már a kezdőlapon (üres felület) történik. */
export default function OnboardingPage() {
  redirect("/");
}
