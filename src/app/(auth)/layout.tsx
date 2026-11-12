import { Logo } from "@/components/layout/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-background p-4">
      <Logo className="mb-8" />
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
