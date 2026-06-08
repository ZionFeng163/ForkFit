import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { NewPostForm } from "./post-editor-form";

export default function NewPostPage() {
  return (
    <AppShell>
      <AuthGuard>
        <NewPostForm />
      </AuthGuard>
    </AppShell>
  );
}
