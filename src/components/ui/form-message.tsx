import { cn } from "@/lib/utils";

export type FormState = { error?: string; success?: string } | null;

export function FormMessage({ state, className }: { state: FormState; className?: string }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={cn(
        "rounded-lg border-2 border-ink px-3.5 py-2.5 text-sm font-medium",
        state.error ? "bg-bubblegum/60 text-ink" : "bg-emerald-100 text-ink",
        className,
      )}
    >
      {state.error ?? state.success}
    </p>
  );
}
