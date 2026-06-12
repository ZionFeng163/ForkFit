"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, Mail, Lock, User, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "@/i18n/routing";
import { loginUser as apiLogin, registerUser } from "@/lib/api";
import { getSafeReturnTo } from "@/lib/auth-navigation";

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

function InputField({
  label, required, icon: Icon, type = "text", value, onChange, placeholder, rightButton, error,
}: {
  label: string; required?: boolean; icon: LucideIcon; type?: string;
  value: string; onChange: (v: string) => void; placeholder: string;
  rightButton?: React.ReactNode; error?: string;
}) {
  return (
    <div className="mb-5">
      <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
        {label} {required && <span style={{ color: "var(--lp-accent)" }}>*</span>}
      </label>
      <div className="relative">
        <Icon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--lp-muted)" }} />
        <input
          type={type}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="auth-input w-full pl-[42px] pr-10 outline-none transition-all duration-200"
        />
        {rightButton}
      </div>
      {error && <div className="text-[12px] mt-1" style={{ color: "#e53e3e" }}>{error}</div>}
    </div>
  );
}

export function AuthPage({ defaultTab = "login" }: { defaultTab?: "login" | "register" }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { refresh } = useAuth();
  const [tab, setTab] = useState(defaultTab);
  const [redirecting, setRedirecting] = useState(false);

  // Login state
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register state
  const [regName, setRegName] = useState("");
  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [showRegPass, setShowRegPass] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  const strength = getPasswordStrength(regPass);

  const loginMutation = useMutation({
    mutationFn: apiLogin,
    onSuccess: async () => {
      setRedirecting(true);
      await refresh();
      const params = new URLSearchParams(window.location.search);
      router.replace(getSafeReturnTo(params.get("returnTo")));
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerUser,
    onSuccess: async () => {
      setRedirecting(true);
      await refresh();
      const params = new URLSearchParams(window.location.search);
      router.replace(getSafeReturnTo(params.get("returnTo")));
    },
  });

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    loginMutation.mutate({ username: loginUser, password: loginPass });
  }

  function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (regPass !== regConfirm) return;
    registerMutation.mutate({
      username: regUser,
      password: regPass,
      display_name: regName || undefined,
    });
  }

  const passwordMismatch = regConfirm.length > 0 && regPass !== regConfirm;
  const isPending = loginMutation.isPending || registerMutation.isPending || redirecting;
  const error = loginMutation.error || registerMutation.error;

  function getErrorMsg() {
    if (!error) return null;
    const msg = error.message || "";
    if (msg.includes("already") || msg.includes("409")) return t("usernameTaken");
    if (msg.includes("at least 6")) return t("passwordTooShort");
    if (msg.includes("characters") || msg.includes("pattern")) return t("usernameInvalid");
    if (tab === "login") return t("loginError");
    return t("registerError");
  }

  return (
    <AuthLayout>
      {/* Tab switcher */}
      <div className="auth-tabs">
        <button onClick={() => setTab("login")} className={`auth-tab ${tab === "login" ? "active" : ""}`}>
          登录
        </button>
        <button onClick={() => setTab("register")} className={`auth-tab ${tab === "register" ? "active" : ""}`}>
          注册
        </button>
      </div>

      {/* Error */}
      {getErrorMsg() && (
        <div className="mb-4 px-4 py-3 rounded-xl text-[13px]" style={{ background: "#fef0ef", color: "#7f3525" }}>
          {getErrorMsg()}
        </div>
      )}

      {/* ===== LOGIN ===== */}
      <div style={{ display: tab === "login" ? "block" : "none" }}>
        <div className="auth-form-header">
          <h1 style={{ color: "var(--lp-fg)" }}>欢迎回来</h1>
          <p>登录你的账号，继续探索美味</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <InputField label="邮箱或用户名" icon={Mail} value={loginUser} onChange={setLoginUser} placeholder="请输入邮箱或用户名" />
          <InputField
            label="密码" icon={Lock} type={showLoginPass ? "text" : "password"}
            value={loginPass} onChange={setLoginPass} placeholder="请输入密码"
            rightButton={
              <button type="button" onClick={() => setShowLoginPass(!showLoginPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded" style={{ color: "var(--lp-muted)" }}>
                {showLoginPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: "var(--lp-muted)" }}>
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-[var(--lp-accent)]" />
              记住我
            </label>
          </div>
          <button type="submit" disabled={isPending}
            className="auth-btn"
            style={{ background: "var(--lp-accent)", color: "white" }}>
            {loginMutation.isPending || redirecting ? <Loader2 size={16} className="animate-spin" /> : null}
            {redirecting ? "正在进入..." : "登录"}
          </button>
        </form>
      </div>

      {/* ===== REGISTER ===== */}
      <div style={{ display: tab === "register" ? "block" : "none" }}>
        <div className="auth-form-header">
          <h1 style={{ color: "var(--lp-fg)" }}>创建账号</h1>
          <p>加入「吃什么」，让 AI 帮你解决每天吃什么</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <InputField label="昵称" icon={User} value={regName} onChange={setRegName} placeholder="给自己起个名字" />
          <InputField label="用户名" required icon={Mail} value={regUser} onChange={setRegUser} placeholder="3-60 个字符，字母数字下划线" />
          <div>
            <InputField
              label="密码" required icon={Lock} type={showRegPass ? "text" : "password"}
              value={regPass} onChange={setRegPass} placeholder="至少 6 位"
              rightButton={
                <button type="button" onClick={() => setShowRegPass(!showRegPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded" style={{ color: "var(--lp-muted)" }}>
                  {showRegPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            {regPass && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex-1 h-[3px] rounded-full transition-all duration-300"
                      style={{ background: i <= strength.level ? (strength.level >= 3 ? "var(--lp-green)" : "var(--lp-accent)") : "var(--lp-border)" }} />
                  ))}
                </div>
                <div className="text-[11px] mt-1" style={{ color: "var(--lp-muted)" }}>{strength.label}</div>
              </div>
            )}
          </div>
          <InputField
            label="确认密码" required icon={Shield} type={showRegConfirm ? "text" : "password"}
            value={regConfirm} onChange={setRegConfirm} placeholder="再次输入密码"
            error={passwordMismatch ? "两次输入的密码不一致" : undefined}
            rightButton={
              <button type="button" onClick={() => setShowRegConfirm(!showRegConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded" style={{ color: "var(--lp-muted)" }}>
                {showRegConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          <button type="submit" disabled={isPending || passwordMismatch}
            className="auth-btn"
            style={{ background: "var(--lp-accent)", color: "white" }}>
            {registerMutation.isPending || redirecting ? <Loader2 size={16} className="animate-spin" /> : null}
            {redirecting ? "正在进入..." : "创建账号"}
          </button>
        </form>
      </div>

      <p className="auth-terms">{tab === "login" ? "登录" : "注册"}即表示你同意平台使用规则和隐私说明。</p>
    </AuthLayout>
  );
}
