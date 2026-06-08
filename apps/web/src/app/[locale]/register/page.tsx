"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, User, Mail, Lock, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "@/i18n/routing";
import { registerUser } from "@/lib/api";

function getPasswordStrength(pw: string): { level: number; label: string } {
  if (!pw) return { level: 0, label: "" };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: "弱" };
  if (score <= 2) return { level: 2, label: "一般" };
  if (score <= 3) return { level: 3, label: "较强" };
  return { level: 4, label: "强" };
}

export default function RegisterPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { refresh } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = getPasswordStrength(password);

  const mutation = useMutation({
    mutationFn: registerUser,
    onSuccess: () => {
      refresh();
      router.push("/discover");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) return;
    mutation.mutate({
      username,
      password,
      display_name: displayName || undefined,
    });
  }

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <AuthLayout>
      {/* Tab switcher */}
      <div className="flex mb-8 rounded-xl overflow-hidden" style={{ border: "1px solid var(--lp-border)" }}>
        <a
          href="/login"
          className="flex-1 py-2.5 text-center text-sm font-medium transition-all"
          style={{ color: "var(--lp-muted)" }}
        >
          登录
        </a>
        <a
          href="/register"
          className="flex-1 py-2.5 text-center text-sm font-semibold transition-all"
          style={{ background: "var(--lp-fg)", color: "white" }}
        >
          注册
        </a>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--lp-fg)" }}>创建账号</h1>
        <p className="text-sm" style={{ color: "var(--lp-muted)" }}>加入「吃什么」，让 AI 帮你解决每天吃什么</p>
      </div>

      {/* Form */}
      <form onSubmit={submit} className="space-y-4">
        {/* Display name */}
        <div>
          <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>昵称</label>
          <div className="relative">
            <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--lp-muted)" }} />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="给自己起个名字"
              className="w-full h-[42px] pl-10 pr-4 rounded-xl text-sm outline-none transition-all duration-200"
              style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,93,58,0.1)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>用户名 <span style={{ color: "var(--lp-accent)" }}>*</span></label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--lp-muted)" }} />
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-60 个字符，字母数字下划线"
              className="w-full h-[42px] pl-10 pr-4 rounded-xl text-sm outline-none transition-all duration-200"
              style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,93,58,0.1)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>密码 <span style={{ color: "var(--lp-accent)" }}>*</span></label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--lp-muted)" }} />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
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
          {/* Strength bars */}
          {password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex-1 h-[3px] rounded-full transition-all duration-300"
                    style={{
                      background: i <= strength.level
                        ? (strength.level >= 3 ? "var(--lp-green)" : "var(--lp-accent)")
                        : "var(--lp-border)",
                    }}
                  />
                ))}
              </div>
              <div className="text-[11px] mt-1" style={{ color: "var(--lp-muted)" }}>{strength.label}</div>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>确认密码 <span style={{ color: "var(--lp-accent)" }}>*</span></label>
          <div className="relative">
            <Shield size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--lp-muted)" }} />
            <input
              type={showConfirm ? "text" : "password"}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              className="w-full h-[42px] pl-10 pr-10 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                border: `1.5px solid ${passwordMismatch ? "#e53e3e" : "var(--lp-border)"}`,
                background: "var(--lp-surface)",
                color: "var(--lp-fg)",
              }}
              onFocus={(e) => { if (!passwordMismatch) { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,93,58,0.1)"; } }}
              onBlur={(e) => { if (!passwordMismatch) { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.boxShadow = "none"; } }}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
              style={{ color: "var(--lp-muted)" }}
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {passwordMismatch && (
            <div className="text-[12px] mt-1" style={{ color: "#e53e3e" }}>两次输入的密码不一致</div>
          )}
        </div>

        {/* Error */}
        {mutation.error && (
          <div className="px-4 py-3 rounded-xl text-[13px]" style={{ background: "#fef0ef", color: "#7f3525" }}>
            {(() => {
              const msg = mutation.error?.message || "";
              if (msg.includes("already") || msg.includes("409")) return t("usernameTaken");
              if (msg.includes("at least 6")) return t("passwordTooShort");
              if (msg.includes("characters") || msg.includes("pattern")) return t("usernameInvalid");
              return t("registerError");
            })()}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={mutation.isPending || passwordMismatch}
          className="w-full h-[46px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50"
          style={{ background: "var(--lp-accent)", color: "white" }}
        >
          {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
          创建账号
        </button>
      </form>

      {/* Terms */}
      <p className="text-center text-xs mt-6 leading-relaxed" style={{ color: "var(--lp-muted)" }}>
        注册即表示你同意<a href="#" className="font-medium" style={{ color: "var(--lp-accent)" }}>用户协议</a>和<a href="#" className="font-medium" style={{ color: "var(--lp-accent)" }}>隐私政策</a>
      </p>
    </AuthLayout>
  );
}
