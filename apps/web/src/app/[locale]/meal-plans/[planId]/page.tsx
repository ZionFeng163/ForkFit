import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { MealPlanView } from "./meal-plan-view";

type PageProps = {
  params: Promise<{ planId: string }>;
};

export default async function MealPlanPage({ params }: PageProps) {
  const { planId } = await params;
  return (
    <AppShell>
      <AuthGuard>
        <MealPlanView planId={planId} />
      </AuthGuard>
    </AppShell>
  );
}
