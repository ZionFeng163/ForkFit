"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/routing";
import { registerUser } from "@/lib/api";

export default function RegisterPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const mutation = useMutation({
    mutationFn: registerUser,
    onSuccess: () => {
      refresh();
      router.push("/discover");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({
      username,
      password,
      display_name: displayName || undefined,
      avatar_url: avatarUrl || undefined,
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("registerTitle")}</h1>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-lg border border-[#e4ded6] bg-white p-6">
          <label className="space-y-1.5 text-sm font-medium">
            <span>{t("username")}</span>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
            />
            <span className="block text-xs text-[#7a7167]">{t("usernameHelp")}</span>
          </label>

          <label className="space-y-1.5 text-sm font-medium">
            <span>{t("password")}</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
            <span className="block text-xs text-[#7a7167]">{t("passwordHelp")}</span>
          </label>

          <label className="space-y-1.5 text-sm font-medium">
            <span>{t("displayName")}</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("displayNamePlaceholder")}
              className="input"
            />
          </label>

          <label className="space-y-1.5 text-sm font-medium">
            <span>{t("avatarUrl")}</span>
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder={t("avatarUrlPlaceholder")}
              className="input"
            />
            <span className="block text-xs text-[#7a7167]">{t("avatarUrlHelp")}</span>
          </label>

          {mutation.error ? (
            <p className="rounded-md border border-[#e1b7a9] bg-[#fff8f5] p-3 text-sm text-[#7f3525]">
              {(() => {
                const msg = mutation.error?.message || "";
                if (msg.includes("already") || msg.includes("409")) return t("usernameTaken");
                if (msg.includes("at least 6")) return t("passwordTooShort");
                if (msg.includes("characters") || msg.includes("pattern")) return t("usernameInvalid");
                return t("registerError");
              })()}
            </p>
          ) : null}

          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            {t("registerButton")}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-[#625b52]">
          {t("hasAccount")}{" "}
          <a href="/login" className="font-medium text-[#1f1f1f] hover:underline">
            {t("linkToLogin")}
          </a>
        </p>
      </div>
    </div>
  );
}
