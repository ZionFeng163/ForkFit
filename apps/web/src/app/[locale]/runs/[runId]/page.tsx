import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { RunView } from "./run-view";

type PageProps = {
  params: Promise<{ locale: string; runId: string }>;
};

export default async function RunPage({ params }: PageProps) {
  const { runId } = await params;

  return (
    <AppShell>
      <AuthGuard>
        <RunView runId={runId} />
      </AuthGuard>
    </AppShell>
  );
}
