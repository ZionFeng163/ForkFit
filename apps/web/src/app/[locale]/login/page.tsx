"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/routing";
import { loginUser } from "@/lib/api";

export default function LoginPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: loginUser,
    onSuccess: () => {
      refresh();
      // Return to the page the user came from, or discover by default
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo") || "/discover";
      router.push(returnTo);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({ username, password });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("loginTitle")}</h1>
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
          </label>

          {mutation.error ? (
            <p className="rounded-md border border-[#e1b7a9] bg-[#fff8f5] p-3 text-sm text-[#7f3525]">
              {t("loginError")}
            </p>
          ) : null}

          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            {t("loginButton")}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-[#625b52]">
          {t("noAccount")}{" "}
          <a href="/register" className="font-medium text-[#1f1f1f] hover:underline">
            {t("linkToRegister")}
          </a>
        </p>
      </div>
    </div>
  );
}
