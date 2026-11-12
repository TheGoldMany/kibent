export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Betöltés">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-10 w-full animate-pulse rounded bg-muted" />
      <div className="h-80 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
