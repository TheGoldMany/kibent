export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Betöltés">
      <div className="h-8 w-48 animate-pulse rounded-full bg-lilac/60" />
      <div className="h-10 w-full animate-pulse rounded-full bg-lilac/60" />
      <div className="h-80 w-full animate-pulse rounded-2xl border-2 border-ink/20 bg-white" />
    </div>
  );
}
