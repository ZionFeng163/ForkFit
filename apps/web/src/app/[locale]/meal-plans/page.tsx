import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { MealPlanList } from "./meal-plan-list";

export default function MealPlansPage() {
  return (
    <AppShell>
      <AuthGuard>
        <MealPlanList />
      </AuthGuard>
    </AppShell>
  );
}
