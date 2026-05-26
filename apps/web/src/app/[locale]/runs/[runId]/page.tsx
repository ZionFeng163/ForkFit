import { AppShell } from "@/components/app-shell";
import { RunView } from "./run-view";

type PageProps = {
  params: Promise<{ locale: string; runId: string }>;
};

export default async function RunPage({ params }: PageProps) {
  const { runId } = await params;

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <RunView runId={runId} />
      </section>
    </AppShell>
  );
}
