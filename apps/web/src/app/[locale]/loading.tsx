import { AppShell } from "@/components/app-shell";

export default function Loading() {
  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <div className="h-7 w-48 animate-pulse rounded bg-[#e8e1d8]" />
          <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-[#ede8e0]" />
        </div>
        <div className="columns-2 gap-4 md:columns-3 lg:columns-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="mb-4 break-inside-avoid overflow-hidden rounded-lg border border-[#e4ded6] bg-white">
              <div className="aspect-[4/5] animate-pulse bg-[#ede8e0]" />
              <div className="space-y-3 p-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-[#ede8e0]" />
                <div className="h-3 w-full animate-pulse rounded bg-[#f0ebe3]" />
                <div className="flex gap-1.5">
                  <div className="h-5 w-14 animate-pulse rounded-md bg-[#ede8e0]" />
                  <div className="h-5 w-16 animate-pulse rounded-md bg-[#ede8e0]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
