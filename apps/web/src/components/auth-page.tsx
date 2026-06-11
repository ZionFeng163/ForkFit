"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, Mail, Lock, User, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useEffect, useState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "@/i18n/routing";
import { loginUser as apiLogin, registerUser } from "@/lib/api";

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
  label: string; required?: boolean; icon: any; type?: string;
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
    onSuccess: () => {
      refresh();
      const params = new URLSearchParams(window.location.search);
      router.push(params.get("returnTo") || "/discover");
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerUser,
    onSuccess: () => {
      refresh();
      router.push("/discover");
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
  const isPending = loginMutation.isPending || registerMutation.isPending;
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

  if (!mounted) {
    return (
      <AuthLayout>
        <div className="h-[400px] grid place-items-center">
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--lp-muted)" }} />
        </div>
      </AuthLayout>
    );
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
            <a href="#" className="text-[13px] font-medium" style={{ color: "var(--lp-accent)" }}>忘记密码？</a>
          </div>
          <button type="submit" disabled={isPending}
            className="auth-btn"
            style={{ background: "var(--lp-accent)", color: "white" }}>
            {loginMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            登录
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
            {registerMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            创建账号
          </button>
        </form>
      </div>

      {/* Divider */}
      <div className="auth-divider"><span>或者</span></div>

      {/* Social login */}
      <div className="auth-social">
        <button className="auth-social-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM12.503 16.51c-1.216 0-2.39-.222-3.484-.586a.712.712 0 0 0-.579.077l-1.53.898a.276.276 0 0 1-.136.044.236.236 0 0 1-.234-.236c0-.059.023-.115.039-.172l.314-1.19a.475.475 0 0 0-.171-.533C4.791 13.688 4 12.16 4 10.492c0-3.18 2.945-5.758 6.582-5.758 3.54 0 6.42 2.494 6.42 5.571 0 3.207-2.88 5.763-6.499 5.763l.001.442z" /></svg>
          微信
        </button>
        <button className="auth-social-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.98-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></svg>
          Apple
        </button>
      </div>

      {/* Terms */}
      <p className="auth-terms">
        {tab === "login" ? "登录" : "注册"}即表示你同意<a href="#">用户协议</a>和<a href="#">隐私政策</a>
      </p>
    </AuthLayout>
  );
}
