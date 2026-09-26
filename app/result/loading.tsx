export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-16" aria-busy="true">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-52 animate-pulse rounded-3xl bg-surface-2" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
    </main>
  );
}
