"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "@/i18n/routing";
import { loginUser } from "@/lib/api";

export default function LoginPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: loginUser,
    onSuccess: () => {
      refresh();
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
    <AuthLayout>
      {/* Tab switcher */}
      <div className="flex mb-8 rounded-xl overflow-hidden" style={{ border: "1px solid var(--lp-border)" }}>
        <a
          href="/login"
          className="flex-1 py-2.5 text-center text-sm font-semibold transition-all"
          style={{ background: "var(--lp-fg)", color: "white" }}
        >
          登录
        </a>
        <a
          href="/register"
          className="flex-1 py-2.5 text-center text-sm font-medium transition-all"
          style={{ color: "var(--lp-muted)" }}
        >
          注册
        </a>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--lp-fg)" }}>欢迎回来</h1>
        <p className="text-sm" style={{ color: "var(--lp-muted)" }}>登录你的账号，继续探索美味</p>
      </div>

      {/* Form */}
      <form onSubmit={submit} className="space-y-4">
        {/* Username */}
        <div>
          <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>邮箱或用户名</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--lp-muted)" }} />
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入邮箱或用户名"
              className="w-full h-[42px] pl-10 pr-4 rounded-xl text-sm outline-none transition-all duration-200"
              style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,93,58,0.1)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>密码</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--lp-muted)" }} />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full h-[42px] pl-10 pr-10 rounded-xl text-sm outline-none transition-all duration-200"
              style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,93,58,0.1)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
              style={{ color: "var(--lp-muted)" }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Remember me + forgot */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: "var(--lp-muted)" }}>
            <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-[var(--lp-accent)]" />
            记住我
          </label>
          <a href="#" className="text-[13px] font-medium transition-colors" style={{ color: "var(--lp-accent)" }}>
            忘记密码？
          </a>
        </div>

        {/* Error */}
        {mutation.error && (
          <div className="px-4 py-3 rounded-xl text-[13px]" style={{ background: "#fef0ef", color: "#7f3525" }}>
            {t("loginError")}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full h-[46px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50"
          style={{ background: "var(--lp-accent)", color: "white" }}
        >
          {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
          登录
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px" style={{ background: "var(--lp-border)" }} />
        <span className="text-xs" style={{ color: "var(--lp-muted)" }}>或者</span>
        <div className="flex-1 h-px" style={{ background: "var(--lp-border)" }} />
      </div>

      {/* Social login */}
      <div className="flex gap-3">
        <button className="flex-1 h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200"
          style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM12.503 16.51c-1.216 0-2.39-.222-3.484-.586a.712.712 0 0 0-.579.077l-1.53.898a.276.276 0 0 1-.136.044.236.236 0 0 1-.234-.236c0-.059.023-.115.039-.172l.314-1.19a.475.475 0 0 0-.171-.533C4.791 13.688 4 12.16 4 10.492c0-3.18 2.945-5.758 6.582-5.758 3.54 0 6.42 2.494 6.42 5.571 0 3.207-2.88 5.763-6.499 5.763l.001.442z" /></svg>
          微信
        </button>
        <button className="flex-1 h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200"
          style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.98-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></svg>
          Apple
        </button>
      </div>

      {/* Terms */}
      <p className="text-center text-xs mt-6 leading-relaxed" style={{ color: "var(--lp-muted)" }}>
        登录即表示你同意<a href="#" className="font-medium" style={{ color: "var(--lp-accent)" }}>用户协议</a>和<a href="#" className="font-medium" style={{ color: "var(--lp-accent)" }}>隐私政策</a>
      </p>
    </AuthLayout>
  );
}
