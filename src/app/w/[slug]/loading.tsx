export default function Loading() {
  return (
    <main className="mx-auto max-w-[1240px] px-4 py-10 lg:px-8" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-48 animate-pulse border border-dashed border-line" />
      <div className="mt-6 h-12 w-80 animate-pulse bg-black/[0.04]" />
      <div className="mt-10 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse border border-black/10 bg-white" />
        ))}
      </div>
    </main>
  );
}
