import { AppShell } from "@/components/app-shell";
import { NewPostForm } from "./post-form";

export default function NewPostPage() {
  return (
    <AppShell>
      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <NewPostForm />
      </section>
    </AppShell>
  );
}
