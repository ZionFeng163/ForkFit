"use client";

import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "@/i18n/routing";
import { getLoginHref } from "@/lib/auth-navigation";
import { useEffect } from "react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(getLoginHref(window.location));
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#9f9890]" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
