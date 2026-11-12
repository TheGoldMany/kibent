import { cn } from "@/lib/utils";

export type FormState = { error?: string; success?: string } | null;

export function FormMessage({ state, className }: { state: FormState; className?: string }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        state.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
        className,
      )}
    >
      {state.error ?? state.success}
    </p>
  );
}
