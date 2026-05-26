import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "./profile-form";

export default function ProfilePage() {
  return (
    <AppShell>
      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <ProfileForm />
      </section>
    </AppShell>
  );
}
