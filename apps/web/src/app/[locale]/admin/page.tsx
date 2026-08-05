"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, Loader2, Shield } from "lucide-react";

import { AuthGuard } from "@/components/auth-guard";
import { BrandMark } from "@/components/brand-logo";
import { useAuth } from "@/components/auth-provider";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  getAdminStats,
  getAdminHealth,
  getAdminActivity,
  listAdminRunFeedback,
  listAdminUsers,
  listAdminPosts,
  deleteAdminUser,
  deleteAdminPost,
  updateAdminUser,
  updateAdminPostStatus,
  batchDeleteAdminUsers,
  batchDeleteAdminPosts,
} from "@/lib/api";
import type {
  AdminRunFeedback,
  AdminStats,
  AdminUser,
  AdminPost,
  PostQuality,
  PostStatus,
  ServiceHealth,
  ActivityItem,
} from "@/types/forkfit";

// ── Icons (inline SVG to match design) ──────────────────────────
const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  services: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
      <circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  content: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  usersStat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    </svg>
  ),
  postsStat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  ),
  runsStat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  clockStat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

type Tab = "dashboard" | "services" | "content" | "users";

const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "数据看板", icon: Icons.dashboard },
  { key: "services", label: "服务状态", icon: Icons.services },
  { key: "content", label: "内容管理", icon: Icons.content },
  { key: "users", label: "用户管理", icon: Icons.users },
];

// ── Page Component ──────────────────────────────────────────────
export default function AdminPage() {
  return (
    <AuthGuard>
      <AdminLayout />
    </AuthGuard>
  );
}

function AdminLayout() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Shield size={48} className="mx-auto mb-4 text-[var(--muted)]" />
          <h1 className="text-xl font-semibold">无权访问</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">你没有管理员权限。</p>
        </div>
      </div>
    );
  }

  const currentTab = TAB_CONFIG.find((t) => t.key === tab)!;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--canvas)]">
      {/* ── Sidebar ── */}
      <aside className="fixed left-0 top-0 z-10 hidden h-screen w-[220px] flex-col border-r border-[var(--outline-variant)] bg-[var(--surface)] p-4 lg:flex">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <BrandMark className="h-8 w-8 text-[var(--brand)]" />
          <span className="text-[15px] font-bold text-[var(--text)]">吃什么</span>
          <span className="ml-auto rounded bg-[var(--primary-container)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand)]">
            Admin
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1">
          <div className="mb-2 px-2 text-[10px] font-bold text-[var(--muted)]">
            概览
          </div>
          {TAB_CONFIG.slice(0, 2).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                tab === t.key
                  ? "bg-[var(--primary-container)] text-[var(--brand)] font-semibold"
                  : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}

          <div className="mb-2 mt-6 px-2 text-[10px] font-bold text-[var(--muted)]">
            管理
          </div>
          {TAB_CONFIG.slice(2).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                tab === t.key
                  ? "bg-[var(--primary-container)] text-[var(--brand)] font-semibold"
                  : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--outline-variant)] pt-4">
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-container)] text-[13px] font-bold text-[var(--brand)]">
              {user?.display_name?.[0] || "管"}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[var(--text)]">
                {user?.display_name || "管理员"}
              </div>
              <div className="text-[11px] text-[var(--muted)]">超级管理员</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ml-0 flex min-h-screen min-w-0 flex-1 flex-col lg:ml-[220px]">
        {/* Header */}
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--outline-variant)] bg-[var(--surface)] px-4 py-3 sm:px-8">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold text-[var(--text)]">{currentTab.label}</h1>
          </div>
          <button
            onClick={() => setRefreshKey((value) => value + 1)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            {Icons.refresh}
            刷新数据
          </button>
        </header>

        <nav className="admin-mobile-tabs flex gap-1 overflow-x-auto border-b border-[var(--outline-variant)] bg-[var(--surface)] px-4 py-2 lg:hidden" aria-label="后台模块">
          {TAB_CONFIG.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${
                tab === t.key ? "bg-[var(--primary-container)] font-semibold text-[var(--brand)]" : "text-[var(--muted)]"
              }`}
              aria-current={tab === t.key ? "page" : undefined}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="min-w-0 p-4 sm:p-8">
          {tab === "dashboard" && <DashboardTab refreshKey={refreshKey} />}
          {tab === "services" && <ServicesTab refreshKey={refreshKey} />}
          {tab === "content" && <ContentTab refreshKey={refreshKey} />}
          {tab === "users" && (
            <UsersTab refreshKey={refreshKey} currentUserId={user.id} />
          )}
        </div>
      </main>
    </div>
  );
}

// ── Dashboard Tab ───────────────────────────────────────────────
function DashboardTab({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [feedback, setFeedback] = useState<AdminRunFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([getAdminStats(), getAdminHealth(), getAdminActivity(), listAdminRunFeedback(8)])
      .then(([s, h, a, f]) => {
        setStats(s);
        setHealth(h.services);
        setActivities(a.activities);
        setFeedback(f.feedback);
      })
      .catch((reason: Error) => {
        setError(reason.message || "后台数据加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, refreshKey]);

  if (loading) return <Loading />;
  if (error || !stats) {
    return <ErrorState message={error || "后台数据加载失败"} onRetry={refresh} />;
  }

  const allOk = health.length > 0 && health.every((s) => s.status === "ok");

  return (
    <>
      <div className="mb-7 grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] lg:grid-cols-4">
        <StatCard
          icon={Icons.postsStat}
          label="发布内容"
          value={stats.published_posts}
          detail={`隐藏 ${stats.hidden_posts} · 草稿 ${stats.draft_posts}`}
        />
        <StatCard
          icon={Icons.usersStat}
          label="总用户数"
          value={stats.user_count}
          detail="已注册账号"
        />
        <StatCard
          icon={Icons.runsStat}
          label="AI 定制次数"
          value={stats.total_runs}
          detail={`成功 ${stats.ai_succeeded_runs} · 失败 ${stats.ai_failed_runs}`}
        />
        <StatCard
          icon={Icons.clockStat}
          label="活跃任务"
          value={stats.active_runs}
          highlight={stats.active_runs > 0}
          detail={stats.active_runs > 0 ? "正在处理中" : "当前无排队任务"}
        />
      </div>

      {/* Quick Service Status */}
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            allOk ? "bg-[var(--success)]" : "bg-[var(--warning)]"
          }`}
        />
        <span className="text-[15px] font-bold text-[var(--text)]">服务状态</span>
        <span className="ml-1 text-xs font-normal text-[var(--muted)]">
          {allOk ? "所有服务正常运行" : "部分服务异常"}
        </span>
      </div>
      <div className="mb-8 grid overflow-hidden rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] sm:grid-cols-2 lg:grid-cols-5">
        {health.map((svc) => (
          <div
            key={svc.name}
            className="border-b border-r border-[var(--outline-variant)] p-4 text-center last:border-r-0 lg:border-b-0"
          >
            <div className="mb-1.5 text-[11px] text-[var(--muted)]">{svc.name}</div>
            <div
              className="text-xl font-bold"
              style={{
                color:
                  svc.status === "ok"
                    ? "var(--success)"
                    : svc.status === "warn"
                    ? "var(--warning)"
                    : "var(--danger)",
              }}
            >
              {svc.status === "ok" ? "正常" : svc.status === "warn" ? "警告" : "异常"}
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">
              延迟 {svc.latency_ms}ms
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="mb-4 text-[15px] font-bold text-[var(--text)]">最近动态</div>
      <div className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)]">
        <ul className="px-5 py-2">
          {activities.length === 0 && (
            <li className="py-8 text-center text-sm text-[var(--muted)]">暂无动态</li>
          )}
          {activities.map((a, i) => (
            <li
              key={i}
              className="flex items-start gap-3 border-b border-[var(--outline-variant)] py-3 last:border-0"
            >
              <span
                className="mt-1.5 inline-block h-2 w-2 min-w-2 rounded-full"
                style={{
                  background:
                    a.color === "green"
                      ? "var(--success)"
                      : a.color === "blue"
                      ? "var(--brand)"
                      : a.color === "orange"
                      ? "var(--brand)"
                      : "var(--danger)",
                }}
              />
              <div>
                <div className="text-[13px] leading-relaxed text-[var(--text)]">
                  {a.text}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--muted)]">{a.time}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-4 mt-8 text-[15px] font-bold text-[var(--text)]">AI 反馈</div>
      <div className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)]">
        <ul className="px-5 py-2">
          {feedback.length === 0 && (
            <li className="py-8 text-center text-sm text-[var(--muted)]">暂无反馈</li>
          )}
          {feedback.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-4 border-b border-[var(--outline-variant)] py-3 last:border-0"
            >
              <div>
                <div className="text-[13px] font-semibold text-[var(--text)]">
                  {item.rating === "helpful" ? "有用" : "没用"} · {item.run_id.slice(0, 16)}...
                </div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">
                  {item.reason || "用户未填写原因"}
                </div>
              </div>
              <span className="whitespace-nowrap text-[11px] text-[var(--muted)]">
                {new Date(item.created_at).toLocaleString("zh-CN")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ── Services Tab ────────────────────────────────────────────────
function ServicesTab({ refreshKey }: { refreshKey: number }) {
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    getAdminHealth()
      .then((r) => setHealth(r.services))
      .catch((reason: Error) => {
        setError(reason.message || "服务状态加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, refreshKey]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const allOk = health.length > 0 && health.every((s) => s.status === "ok");

  // Map backend health to display cards
  const serviceCards = health.map((svc) => {
    const config = SERVICE_DISPLAY_CONFIG[svc.name] || SERVICE_DISPLAY_CONFIG.default;
    return { ...svc, ...config };
  });

  return (
    <>
      <div className="mb-6 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            allOk ? "bg-[var(--success)]" : "bg-[var(--warning)]"
          }`}
        />
        <span className="text-[15px] font-bold text-[var(--text)]">
          {allOk ? "所有服务运行正常" : "部分服务异常"}
        </span>
        <span className="ml-1 text-xs font-normal text-[var(--muted)]">上次检查：刚刚</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {serviceCards.map((svc) => (
          <ServiceCard key={svc.name} service={svc} />
        ))}
      </div>
    </>
  );
}

const SERVICE_DISPLAY_CONFIG: Record<
  string,
  { desc: string; iconBg: string; iconColor: string; icon: React.ReactNode; metrics: { label: string; key: string }[] }
> = {
  database: {
    desc: "用户数据 + 菜谱内容",
    iconBg: "var(--success-soft)",
    iconColor: "var(--success)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
    metrics: [
      { label: "查询延迟", key: "latency" },
      { label: "状态", key: "status" },
      { label: "连接", key: "details" },
    ],
  },
  redis: {
    desc: "限流 + 运行态缓存",
    iconBg: "var(--danger-soft)",
    iconColor: "var(--danger)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    metrics: [
      { label: "延迟", key: "latency" },
      { label: "状态", key: "status" },
      { label: "内存", key: "details" },
    ],
  },
  executor: {
    desc: "inline 任务执行器",
    iconBg: "var(--primary-container)",
    iconColor: "var(--brand)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    metrics: [
      { label: "延迟", key: "latency" },
      { label: "状态", key: "status" },
      { label: "详情", key: "details" },
    ],
  },
  llm: {
    desc: "AI 定制模型连通性",
    iconBg: "var(--primary-container)",
    iconColor: "var(--brand)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    ),
    metrics: [
      { label: "延迟", key: "latency" },
      { label: "状态", key: "status" },
      { label: "模型", key: "details" },
    ],
  },
  default: {
    desc: "系统服务",
    iconBg: "var(--surface-soft)",
    iconColor: "var(--muted)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <circle cx="12" cy="12" r="3" /><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
    metrics: [
      { label: "延迟", key: "latency" },
      { label: "状态", key: "status" },
      { label: "详情", key: "details" },
    ],
  },
};

function ServiceCard({ service }: { service: ServiceHealth & { desc: string; iconBg: string; iconColor: string; icon: React.ReactNode; metrics: { label: string; key: string }[] } }) {
  const statusLabel = service.status === "ok" ? "运行中" : service.status === "warn" ? "警告" : "异常";
  const statusClasses =
    service.status === "ok"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : service.status === "warn"
      ? "bg-[var(--warning-soft)] text-[var(--warning)]"
      : "bg-[var(--danger-soft)] text-[var(--danger)]";

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-[10px]"
            style={{ background: service.iconBg, color: service.iconColor }}
          >
            {service.icon}
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">{service.name}</div>
            <div className="text-xs text-[var(--muted)]">{service.desc}</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses}`}>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
          {statusLabel}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-[var(--surface-soft)] p-2.5">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            响应时间
          </div>
          <div className="text-base font-bold tabular-nums">{service.latency_ms}ms</div>
        </div>
        <div className="rounded-lg bg-[var(--surface-soft)] p-2.5">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            状态
          </div>
          <div
            className="text-base font-bold"
            style={{
              color:
                service.status === "ok"
                  ? "var(--success)"
                  : service.status === "warn"
                  ? "var(--warning)"
                  : "var(--danger)",
            }}
          >
            {statusLabel}
          </div>
        </div>
        <div className="rounded-lg bg-[var(--surface-soft)] p-2.5">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            详情
          </div>
          <div className="truncate text-base font-bold" title={service.details}>
            {service.details || "-"}
          </div>
        </div>
      </div>

      {/* Latency bar */}
      <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
        <span>延迟</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-soft)]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (service.latency_ms / 500) * 100)}%`,
              background:
                service.latency_ms < 100
                  ? "var(--success)"
                  : service.latency_ms < 300
                  ? "var(--warning)"
                  : "var(--danger)",
            }}
          />
        </div>
        <span>{service.latency_ms}ms</span>
      </div>
    </div>
  );
}

// ── Content Tab ─────────────────────────────────────────────────
function ContentTab({ refreshKey }: { refreshKey: number }) {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");
  const [qualityFilter, setQualityFilter] = useState<PostQuality | "all">("all");
  const [tagFilter, setTagFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<AdminPost | "batch" | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const limit = 10;
  const debouncedSearch = useDebouncedValue(search, 300);

  const fetchPosts = useCallback(() => {
    setLoading(true);
    setError("");
    listAdminPosts(limit, page * limit, debouncedSearch, {
      status: statusFilter,
      quality: qualityFilter,
      tag: tagFilter,
    })
      .then((res) => {
        setPosts(res.posts);
        setTotal(res.total);
        setSelectedIds(new Set());
      })
      .catch((reason: Error) => {
        setError(reason.message || "菜谱列表加载失败");
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, page, qualityFilter, statusFilter, tagFilter]);

  useEffect(() => {
    const timer = window.setTimeout(fetchPosts, 0);
    return () => window.clearTimeout(timer);
  }, [fetchPosts, refreshKey]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    const ids = pendingDelete === "batch"
      ? Array.from(selectedIds)
      : [pendingDelete.id];

    setActionPending(true);
    setError("");
    setMessage("");
    try {
      if (pendingDelete === "batch") {
        const result = await batchDeleteAdminPosts(ids);
        setMessage(`已删除 ${result.deleted} 篇菜谱`);
      } else {
        await deleteAdminPost(pendingDelete.id);
        setMessage(`已删除「${pendingDelete.title}」`);
      }
      setPendingDelete(null);
      setSelectedIds(new Set());
      if (ids.length >= posts.length && page > 0) {
        setPage((value) => value - 1);
      } else {
        fetchPosts();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
    } finally {
      setActionPending(false);
    }
  }

  async function changePostStatus(post: AdminPost, status: PostStatus) {
    setActionPending(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateAdminPostStatus(post.id, status);
      setPosts((current) => current.map((item) => (
        item.id === post.id ? updated : item
      )));
      setMessage(`已${status === "published" ? "恢复发布" : status === "hidden" ? "下架" : "设为草稿"}「${post.title}」`);
      if (statusFilter !== "all" && statusFilter !== status) fetchPosts();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "状态更新失败");
    } finally {
      setActionPending(false);
    }
  }

  const totalPages = Math.ceil(total / limit);
  const pageNumbers = getPageNumbers(page, totalPages);
  const allSelected = posts.length > 0 && posts.every((post) => selectedIds.has(post.id));

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(posts.map((post) => post.id)));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--outline-variant)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--text)]">菜谱管理</span>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setPendingDelete("batch")}
              className="rounded-md border border-[var(--danger)] px-2.5 py-1 text-xs font-medium text-[var(--danger)]"
            >
              删除所选（{selectedIds.size}）
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as PostStatus | "all"); setPage(0); }}
            className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none"
          >
            <option value="all">全部状态</option>
            <option value="published">已发布</option>
            <option value="hidden">已下架</option>
            <option value="draft">草稿</option>
          </select>
          <select
            value={qualityFilter}
            onChange={(e) => { setQualityFilter(e.target.value as PostQuality | "all"); setPage(0); }}
            className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none"
          >
            <option value="all">全部质量</option>
            <option value="complete">完整</option>
            <option value="missing_image">缺图</option>
            <option value="missing_steps">缺步骤</option>
            <option value="incomplete">缺图和步骤</option>
          </select>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-soft)] px-3 py-1.5">
            {Icons.search}
            <input
              type="text"
              placeholder="标题 / 标签..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-36 border-none bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
            />
          </div>
          <input
            type="text"
            placeholder="标签筛选"
            value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setPage(0); }}
            className="w-24 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          />
        </div>
      </div>

      <FeedbackBanner error={error} message={message} />

      {/* Table */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--outline-variant)] bg-[var(--surface-soft)]">
            <th className="w-12 px-5 py-3 text-left">
              <input
                type="checkbox"
                aria-label="选择当前页全部菜谱"
                checked={allSelected}
                onChange={toggleAll}
              />
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              菜谱
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              状态
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              质量
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              作者
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              来源
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              发布时间
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-12 text-center text-sm text-[var(--muted)]">
                {loading ? "正在加载..." : search ? "没有匹配的菜谱" : "暂无菜谱"}
              </td>
            </tr>
          )}
          {posts.map((p) => (
            <tr
              key={p.id}
              className="border-b border-[var(--outline-variant)] transition-colors last:border-0 hover:bg-[var(--surface-soft)]"
            >
              <td className="px-5 py-3.5">
                <input
                  type="checkbox"
                  aria-label={`选择菜谱 ${p.title}`}
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleSelection(p.id)}
                />
              </td>
              <td className="px-5 py-3.5">
                <div className="text-sm font-semibold text-[var(--text)]">{p.title}</div>
                <div className="mt-0.5 text-[11px] text-[var(--muted)]">{p.id}</div>
              </td>
              <td className="px-5 py-3.5">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-5 py-3.5">
                <QualityBadge quality={p.quality} />
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--primary-container)] text-[11px] font-bold text-[var(--brand)]">
                    {p.author[0]}
                  </div>
                  <span className="text-sm font-semibold text-[var(--text)]">{p.author}</span>
                </div>
              </td>
              <td className="px-5 py-3.5 text-xs text-[var(--muted)]">
                <div className="max-w-[150px] truncate" title={p.source_url || p.source_name}>
                  {p.source_name || "用户投稿"}
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-[var(--muted)]">
                {new Date(p.created_at).toLocaleDateString("zh-CN")}
              </td>
              <td className="px-5 py-3.5 text-right">
                <button
                  onClick={() => void changePostStatus(p, p.status === "published" ? "hidden" : "published")}
                  disabled={actionPending}
                  className="mr-2 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)] transition-colors hover:border-[var(--success)] hover:text-[var(--success)] disabled:opacity-50"
                >
                  {p.status === "published" ? "下架" : "恢复"}
                </button>
                <button
                  onClick={() => setPendingDelete(p)}
                  className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-[var(--outline-variant)] px-5 py-3 text-xs text-[var(--muted)]">
        <span>
          共 {total} 条，第 {page + 1} / {totalPages || 1} 页
        </span>
        <div className="flex gap-1">
          <PaginationBtn onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
            ‹
          </PaginationBtn>
          {pageNumbers.map((pageNumber) => (
            <PaginationBtn
              key={pageNumber}
              active={pageNumber === page}
              onClick={() => setPage(pageNumber)}
            >
              {pageNumber + 1}
            </PaginationBtn>
          ))}
          <PaginationBtn
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
          >
            ›
          </PaginationBtn>
        </div>
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        title={pendingDelete === "batch" ? "批量删除菜谱" : "删除菜谱"}
        message={
          pendingDelete === "batch"
            ? `确定删除选中的 ${selectedIds.size} 篇菜谱吗？此操作无法撤销。`
            : pendingDelete
              ? `确定删除「${pendingDelete.title}」吗？此操作无法撤销。`
              : ""
        }
        confirmLabel={actionPending ? "删除中..." : "删除"}
        danger
        onConfirm={() => { if (!actionPending) void confirmDelete(); }}
        onCancel={() => { if (!actionPending) setPendingDelete(null); }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: PostStatus }) {
  const label = status === "published" ? "已发布" : status === "hidden" ? "已下架" : "草稿";
  const classes = status === "published"
    ? "bg-[var(--success-soft)] text-[var(--success)]"
    : status === "hidden"
    ? "bg-[var(--primary-container)] text-[var(--brand)]"
    : "bg-[var(--surface-soft)] text-[var(--muted)]";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>
      {label}
    </span>
  );
}

function QualityBadge({ quality }: { quality: PostQuality }) {
  const label: Record<PostQuality, string> = {
    complete: "完整",
    missing_image: "缺图",
    missing_steps: "缺步骤",
    incomplete: "不完整",
  };
  const ok = quality === "complete";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        ok ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"
      }`}
    >
      {label[quality]}
    </span>
  );
}

// ── Users Tab ───────────────────────────────────────────────────
type UserAction =
  | { type: "delete"; user: AdminUser }
  | { type: "batch-delete" }
  | { type: "role"; user: AdminUser; role: "user" | "admin" };

function UsersTab({
  refreshKey,
  currentUserId,
}: {
  refreshKey: number;
  currentUserId: string;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<UserAction | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const limit = 10;
  const debouncedSearch = useDebouncedValue(search, 300);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    setError("");
    listAdminUsers(limit, page * limit, debouncedSearch)
      .then((res) => {
        setUsers(res.users);
        setTotal(res.total);
        setSelectedIds(new Set());
      })
      .catch((reason: Error) => {
        setError(reason.message || "用户列表加载失败");
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, page]);

  useEffect(() => {
    const timer = window.setTimeout(fetchUsers, 0);
    return () => window.clearTimeout(timer);
  }, [fetchUsers, refreshKey]);

  async function confirmAction() {
    if (!pendingAction) return;
    setActionPending(true);
    setError("");
    setMessage("");

    try {
      if (pendingAction.type === "role") {
        const updated = await updateAdminUser(pendingAction.user.id, {
          role: pendingAction.role,
        });
        setUsers((current) => current.map((user) => (
          user.id === updated.id ? { ...user, role: updated.role } : user
        )));
        setMessage(`已将 ${updated.username} 设为${updated.role === "admin" ? "管理员" : "普通用户"}`);
      } else {
        const ids = pendingAction.type === "batch-delete"
          ? Array.from(selectedIds)
          : [pendingAction.user.id];
        if (pendingAction.type === "batch-delete") {
          const result = await batchDeleteAdminUsers(ids);
          setMessage(`已删除 ${result.deleted} 个用户`);
        } else {
          await deleteAdminUser(pendingAction.user.id);
          setMessage(`已删除用户 ${pendingAction.user.username}`);
        }
        setSelectedIds(new Set());
        if (ids.length >= users.length && page > 0) {
          setPage((value) => value - 1);
        } else {
          fetchUsers();
        }
      }
      setPendingAction(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setActionPending(false);
    }
  }

  const totalPages = Math.ceil(total / limit);
  const pageNumbers = getPageNumbers(page, totalPages);
  const selectableUsers = users.filter((user) => user.id !== currentUserId);
  const allSelected = selectableUsers.length > 0
    && selectableUsers.every((user) => selectedIds.has(user.id));

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(selectableUsers.map((user) => user.id)),
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--outline-variant)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--text)]">用户管理</span>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setPendingAction({ type: "batch-delete" })}
              className="rounded-md border border-[var(--danger)] px-2.5 py-1 text-xs font-medium text-[var(--danger)]"
            >
              删除所选（{selectedIds.size}）
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-soft)] px-3 py-1.5">
          {Icons.search}
          <input
            type="text"
            placeholder="搜索用户昵称..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-44 border-none bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          />
        </div>
      </div>

      <FeedbackBanner error={error} message={message} />

      {/* Table */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--outline-variant)] bg-[var(--surface-soft)]">
            <th className="w-12 px-5 py-3 text-left">
              <input
                type="checkbox"
                aria-label="选择当前页全部用户"
                checked={allSelected}
                onChange={toggleAll}
              />
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              用户
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              角色
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              注册时间
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="px-5 py-12 text-center text-sm text-[var(--muted)]">
                {loading ? "正在加载..." : search ? "没有匹配的用户" : "暂无用户"}
              </td>
            </tr>
          )}
          {users.map((u) => (
            <tr
              key={u.id}
              className="border-b border-[var(--outline-variant)] transition-colors last:border-0 hover:bg-[var(--surface-soft)]"
            >
              <td className="px-5 py-3.5">
                <input
                  type="checkbox"
                  aria-label={`选择用户 ${u.username}`}
                  checked={selectedIds.has(u.id)}
                  disabled={u.id === currentUserId}
                  onChange={() => toggleSelection(u.id)}
                />
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--primary-container)] text-[11px] font-bold text-[var(--brand)]">
                    {u.display_name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text)]">{u.display_name}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      @{u.username}{u.id === currentUserId ? " · 当前账号" : ""}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <button
                  onClick={() => setPendingAction({
                    type: "role",
                    user: u,
                    role: u.role === "admin" ? "user" : "admin",
                  })}
                  disabled={u.id === currentUserId}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                    u.role === "admin"
                      ? "border-[var(--success)] text-[var(--success)]"
                      : "border-[var(--outline-variant)] text-[var(--muted)]"
                  }`}
                >
                  {u.role === "admin" ? "管理员" : "用户"}
                </button>
              </td>
              <td className="px-5 py-3.5 text-sm text-[var(--muted)]">
                {new Date(u.created_at).toLocaleDateString("zh-CN")}
              </td>
              <td className="px-5 py-3.5 text-right">
                <button
                  onClick={() => setPendingAction({ type: "delete", user: u })}
                  disabled={u.id === currentUserId}
                  className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-[var(--outline-variant)] px-5 py-3 text-xs text-[var(--muted)]">
        <span>
          共 {total} 位用户，第 {page + 1} / {totalPages || 1} 页
        </span>
        <div className="flex gap-1">
          <PaginationBtn onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
            ‹
          </PaginationBtn>
          {pageNumbers.map((pageNumber) => (
            <PaginationBtn
              key={pageNumber}
              active={pageNumber === page}
              onClick={() => setPage(pageNumber)}
            >
              {pageNumber + 1}
            </PaginationBtn>
          ))}
          <PaginationBtn
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
          >
            ›
          </PaginationBtn>
        </div>
      </div>

      <ConfirmModal
        open={pendingAction !== null}
        title={
          pendingAction?.type === "role"
            ? "修改用户角色"
            : pendingAction?.type === "batch-delete"
              ? "批量删除用户"
              : "删除用户"
        }
        message={
          pendingAction?.type === "role"
            ? `确定将 ${pendingAction.user.username} 设为${pendingAction.role === "admin" ? "管理员" : "普通用户"}吗？`
            : pendingAction?.type === "batch-delete"
              ? `确定删除选中的 ${selectedIds.size} 个用户吗？此操作无法撤销。`
              : pendingAction?.type === "delete"
                ? `确定删除用户 ${pendingAction.user.username} 吗？此操作无法撤销。`
                : ""
        }
        confirmLabel={actionPending ? "处理中..." : "确认"}
        danger={pendingAction?.type !== "role"}
        onConfirm={() => { if (!actionPending) void confirmAction(); }}
        onCancel={() => { if (!actionPending) setPendingAction(null); }}
      />
    </div>
  );
}

// ── Shared Components ───────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  highlight,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
  detail: string;
}) {
  return (
    <div className="border-b border-r border-[var(--outline-variant)] p-4 last:border-r-0 lg:border-b-0">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
        {icon}
        {label}
      </div>
      <div
        className="mb-1.5 text-[28px] font-extrabold leading-tight tabular-nums"
        style={{ color: highlight ? "var(--warning)" : undefined }}
      >
        {value.toLocaleString()}
      </div>
      <div className={highlight ? "text-xs text-[var(--warning)]" : "text-xs text-[var(--muted)]"}>
        {detail}
      </div>
    </div>
  );
}

function PaginationBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
        active
          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
          : "border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
      } ${disabled ? "opacity-30" : ""}`}
    >
      {children}
    </button>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--danger-soft)] bg-[var(--danger-soft)] p-5">
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-[var(--danger)]">数据加载失败</div>
          <div className="mt-1 text-xs text-[var(--danger)]">{message}</div>
        </div>
        <button
          onClick={onRetry}
          className="rounded-md border border-[var(--danger-soft)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--danger)]"
        >
          重试
        </button>
      </div>
    </div>
  );
}

function FeedbackBanner({
  error,
  message,
}: {
  error: string;
  message: string;
}) {
  if (!error && !message) return null;

  return (
    <div
      className={`flex items-center gap-2 border-b px-5 py-3 text-xs ${
        error
          ? "border-[var(--danger-soft)] bg-[var(--danger-soft)] text-[var(--danger)]"
          : "border-[var(--success-soft)] bg-[var(--success-soft)] text-[var(--success)]"
      }`}
    >
      {error ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
      {error || message}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}

function getPageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const start = Math.min(
    Math.max(0, currentPage - 2),
    totalPages - 5,
  );
  return Array.from({ length: 5 }, (_, index) => start + index);
}
