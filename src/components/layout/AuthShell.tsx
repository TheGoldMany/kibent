import { Logo } from "@/components/layout/Logo";

/** Középre igazított keret az onboardinghoz és a meghívó hibaoldalhoz. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cotton">
      <header className="mx-auto flex max-w-6xl items-center px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-col px-4 pb-16 pt-4 sm:pt-10">{children}</main>
    </div>
  );
}
