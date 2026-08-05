import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { MealPlanForm } from "./meal-plan-form";

export default function NewMealPlanPage() {
  return (
    <AppShell>
      <AuthGuard>
        <MealPlanForm />
      </AuthGuard>
    </AppShell>
  );
}
