"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, Loader2, Shield } from "lucide-react";

import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  getAdminStats,
  getAdminHealth,
  getAdminActivity,
  listAdminUsers,
  listAdminPosts,
  deleteAdminUser,
  deleteAdminPost,
  updateAdminUser,
  batchDeleteAdminUsers,
  batchDeleteAdminPosts,
} from "@/lib/api";
import type {
  AdminStats,
  AdminUser,
  AdminPost,
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
  const [clock, setClock] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setClock(
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Shield size={48} className="mx-auto mb-4 text-[#9f9890]" />
          <h1 className="text-xl font-semibold">无权访问</h1>
          <p className="mt-2 text-sm text-[#6f6a61]">你没有管理员权限。</p>
        </div>
      </div>
    );
  }

  const currentTab = TAB_CONFIG.find((t) => t.key === tab)!;

  return (
    <div className="flex min-h-screen bg-[#fafaf8]">
      {/* ── Sidebar ── */}
      <aside className="fixed left-0 top-0 z-10 flex h-screen w-[220px] flex-col border-r border-[#e8e6e0] bg-white p-4">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e85d3a] text-sm font-bold text-white">
            吃
          </div>
          <span className="text-[15px] font-bold text-[#1a1917]">吃什么</span>
          <span className="ml-auto rounded bg-[#fef0ec] px-1.5 py-0.5 text-[10px] font-semibold text-[#e85d3a]">
            Admin
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1">
          <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-[#a8a59d]">
            概览
          </div>
          {TAB_CONFIG.slice(0, 2).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                tab === t.key
                  ? "bg-[#fef0ec] text-[#e85d3a] font-semibold"
                  : "text-[#7c7a73] hover:bg-[#f5f4f0] hover:text-[#1a1917]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}

          <div className="mb-2 mt-6 px-2 text-[10px] font-bold uppercase tracking-widest text-[#a8a59d]">
            管理
          </div>
          {TAB_CONFIG.slice(2).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                tab === t.key
                  ? "bg-[#fef0ec] text-[#e85d3a] font-semibold"
                  : "text-[#7c7a73] hover:bg-[#f5f4f0] hover:text-[#1a1917]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-[#e8e6e0] pt-4">
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fef0ec] text-[13px] font-bold text-[#e85d3a]">
              {user?.display_name?.[0] || "管"}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#1a1917]">
                {user?.display_name || "管理员"}
              </div>
              <div className="text-[11px] text-[#7c7a73]">超级管理员</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ml-[220px] flex min-h-screen flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-[5] flex h-14 items-center justify-between border-b border-[#e8e6e0] bg-[#fafaf8]/85 px-8 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold text-[#1a1917]">{currentTab.label}</h1>
            <span className="text-xs text-[#7c7a73]">{clock}</span>
          </div>
          <button
            onClick={() => setRefreshKey((value) => value + 1)}
            className="flex items-center gap-1.5 rounded-lg border border-[#e8e6e0] bg-white px-3 py-1.5 text-xs font-medium text-[#7c7a73] transition-colors hover:border-[#e85d3a] hover:text-[#e85d3a]"
          >
            {Icons.refresh}
            刷新数据
          </button>
        </header>

        {/* Content */}
        <div className="p-8">
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([getAdminStats(), getAdminHealth(), getAdminActivity()])
      .then(([s, h, a]) => {
        setStats(s);
        setHealth(h.services);
        setActivities(a.activities);
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
      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard
          icon={Icons.postsStat}
          label="菜谱总数"
          value={stats.post_count}
          detail={`今日新增 ${stats.today_new_posts}`}
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
          detail={`今日新增 ${stats.today_runs}`}
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
            allOk ? "bg-[#2d8a56] animate-pulse" : "bg-[#c9a030]"
          }`}
        />
        <span className="text-[15px] font-bold text-[#1a1917]">服务状态</span>
        <span className="ml-1 text-xs font-normal text-[#7c7a73]">
          {allOk ? "所有服务正常运行" : "部分服务异常"}
        </span>
      </div>
      <div className="mb-8 grid grid-cols-5 gap-4">
        {health.map((svc) => (
          <div
            key={svc.name}
            className="rounded-xl border border-[#e8e6e0] bg-white p-4 text-center"
          >
            <div className="mb-1.5 text-[11px] text-[#7c7a73]">{svc.name}</div>
            <div
              className="text-xl font-bold"
              style={{
                color:
                  svc.status === "ok"
                    ? "#2d8a56"
                    : svc.status === "warn"
                    ? "#c9a030"
                    : "#d94452",
              }}
            >
              {svc.status === "ok" ? "正常" : svc.status === "warn" ? "警告" : "异常"}
            </div>
            <div className="mt-1 text-[11px] text-[#7c7a73]">
              延迟 {svc.latency_ms}ms
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="mb-4 text-[15px] font-bold text-[#1a1917]">最近动态</div>
      <div className="rounded-xl border border-[#e8e6e0] bg-white">
        <ul className="px-5 py-2">
          {activities.length === 0 && (
            <li className="py-8 text-center text-sm text-[#a8a59d]">暂无动态</li>
          )}
          {activities.map((a, i) => (
            <li
              key={i}
              className="flex items-start gap-3 border-b border-[#e8e6e0] py-3 last:border-0"
            >
              <span
                className="mt-1.5 inline-block h-2 w-2 min-w-2 rounded-full"
                style={{
                  background:
                    a.color === "green"
                      ? "#2d8a56"
                      : a.color === "blue"
                      ? "#4a8ac9"
                      : a.color === "orange"
                      ? "#e85d3a"
                      : "#d94452",
                }}
              />
              <div>
                <div className="text-[13px] leading-relaxed text-[#1a1917]">
                  {a.text}
                </div>
                <div className="mt-0.5 text-[11px] text-[#a8a59d]">{a.time}</div>
              </div>
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
            allOk ? "bg-[#2d8a56] animate-pulse" : "bg-[#c9a030]"
          }`}
        />
        <span className="text-[15px] font-bold text-[#1a1917]">
          {allOk ? "所有服务运行正常" : "部分服务异常"}
        </span>
        <span className="ml-1 text-xs font-normal text-[#7c7a73]">上次检查：刚刚</span>
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
  PostgreSQL: {
    desc: "用户数据 + 菜谱内容",
    iconBg: "#e8f5ee",
    iconColor: "#2d8a56",
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
  Redis: {
    desc: "会话缓存 + 热数据",
    iconBg: "#fde8ea",
    iconColor: "#d94452",
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
  Kafka: {
    desc: "事件流 + 消息队列",
    iconBg: "#eef4fd",
    iconColor: "#4a8ac9",
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
  "Bailian API": {
    desc: "AI 定制 + 推荐算法",
    iconBg: "#fef0ec",
    iconColor: "#e85d3a",
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
    iconBg: "#f5f4f0",
    iconColor: "#7c7a73",
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
      ? "bg-[#e8f5ee] text-[#2d8a56]"
      : service.status === "warn"
      ? "bg-[#fef9ec] text-[#c9a030]"
      : "bg-[#fde8ea] text-[#d94452]";

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-[#e8e6e0] bg-white p-5">
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
            <div className="text-sm font-semibold text-[#1a1917]">{service.name}</div>
            <div className="text-xs text-[#7c7a73]">{service.desc}</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses}`}>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
          {statusLabel}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-[#f5f4f0] p-2.5">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#7c7a73]">
            响应时间
          </div>
          <div className="text-base font-bold tabular-nums">{service.latency_ms}ms</div>
        </div>
        <div className="rounded-lg bg-[#f5f4f0] p-2.5">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#7c7a73]">
            状态
          </div>
          <div
            className="text-base font-bold"
            style={{
              color:
                service.status === "ok"
                  ? "#2d8a56"
                  : service.status === "warn"
                  ? "#c9a030"
                  : "#d94452",
            }}
          >
            {statusLabel}
          </div>
        </div>
        <div className="rounded-lg bg-[#f5f4f0] p-2.5">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#7c7a73]">
            详情
          </div>
          <div className="truncate text-base font-bold" title={service.details}>
            {service.details || "-"}
          </div>
        </div>
      </div>

      {/* Latency bar */}
      <div className="flex items-center gap-2 text-[11px] text-[#7c7a73]">
        <span>延迟</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f5f4f0]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (service.latency_ms / 500) * 100)}%`,
              background:
                service.latency_ms < 100
                  ? "#2d8a56"
                  : service.latency_ms < 300
                  ? "#c9a030"
                  : "#d94452",
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
    listAdminPosts(limit, page * limit, debouncedSearch)
      .then((res) => {
        setPosts(res.posts);
        setTotal(res.total);
        setSelectedIds(new Set());
      })
      .catch((reason: Error) => {
        setError(reason.message || "菜谱列表加载失败");
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, page]);

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
    <div className="overflow-hidden rounded-xl border border-[#e8e6e0] bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e6e0] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#1a1917]">菜谱管理</span>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setPendingDelete("batch")}
              className="rounded-md border border-[#d94452] px-2.5 py-1 text-xs font-medium text-[#d94452]"
            >
              删除所选（{selectedIds.size}）
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[#e8e6e0] bg-[#f5f4f0] px-3 py-1.5">
          {Icons.search}
          <input
            type="text"
            placeholder="搜索菜谱标题..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-44 border-none bg-transparent text-xs text-[#1a1917] outline-none placeholder:text-[#a8a59d]"
          />
        </div>
      </div>

      <FeedbackBanner error={error} message={message} />

      {/* Table */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-[#e8e6e0] bg-[#f5f4f0]">
            <th className="w-12 px-5 py-3 text-left">
              <input
                type="checkbox"
                aria-label="选择当前页全部菜谱"
                checked={allSelected}
                onChange={toggleAll}
              />
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7c7a73]">
              菜谱
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7c7a73]">
              作者
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7c7a73]">
              发布时间
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[#7c7a73]">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 && (
            <tr>
              <td colSpan={5} className="px-5 py-12 text-center text-sm text-[#a8a59d]">
                {loading ? "正在加载..." : search ? "没有匹配的菜谱" : "暂无菜谱"}
              </td>
            </tr>
          )}
          {posts.map((p) => (
            <tr
              key={p.id}
              className="border-b border-[#e8e6e0] transition-colors last:border-0 hover:bg-[#f5f4f0]"
            >
              <td className="px-5 py-3.5">
                <input
                  type="checkbox"
                  aria-label={`选择菜谱 ${p.title}`}
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleSelection(p.id)}
                />
              </td>
              <td className="px-5 py-3.5 text-sm font-semibold text-[#1a1917]">{p.title}</td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#fef0ec] text-[11px] font-bold text-[#e85d3a]">
                    {p.author[0]}
                  </div>
                  <span className="text-sm font-semibold text-[#1a1917]">{p.author}</span>
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-[#7c7a73]">
                {new Date(p.created_at).toLocaleDateString("zh-CN")}
              </td>
              <td className="px-5 py-3.5 text-right">
                <button
                  onClick={() => setPendingDelete(p)}
                  className="rounded-lg border border-[#e8e6e0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#7c7a73] transition-colors hover:border-[#d94452] hover:text-[#d94452]"
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
      <div className="flex items-center justify-between border-t border-[#e8e6e0] px-5 py-3 text-xs text-[#7c7a73]">
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
    <div className="overflow-hidden rounded-xl border border-[#e8e6e0] bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e6e0] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#1a1917]">用户管理</span>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setPendingAction({ type: "batch-delete" })}
              className="rounded-md border border-[#d94452] px-2.5 py-1 text-xs font-medium text-[#d94452]"
            >
              删除所选（{selectedIds.size}）
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[#e8e6e0] bg-[#f5f4f0] px-3 py-1.5">
          {Icons.search}
          <input
            type="text"
            placeholder="搜索用户昵称..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-44 border-none bg-transparent text-xs text-[#1a1917] outline-none placeholder:text-[#a8a59d]"
          />
        </div>
      </div>

      <FeedbackBanner error={error} message={message} />

      {/* Table */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-[#e8e6e0] bg-[#f5f4f0]">
            <th className="w-12 px-5 py-3 text-left">
              <input
                type="checkbox"
                aria-label="选择当前页全部用户"
                checked={allSelected}
                onChange={toggleAll}
              />
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7c7a73]">
              用户
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7c7a73]">
              角色
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7c7a73]">
              注册时间
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[#7c7a73]">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="px-5 py-12 text-center text-sm text-[#a8a59d]">
                {loading ? "正在加载..." : search ? "没有匹配的用户" : "暂无用户"}
              </td>
            </tr>
          )}
          {users.map((u) => (
            <tr
              key={u.id}
              className="border-b border-[#e8e6e0] transition-colors last:border-0 hover:bg-[#f5f4f0]"
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
                  <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#fef0ec] text-[11px] font-bold text-[#e85d3a]">
                    {u.display_name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#1a1917]">{u.display_name}</div>
                    <div className="text-[11px] text-[#7c7a73]">
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
                      ? "border-[#2d8a56] text-[#2d8a56]"
                      : "border-[#e8e6e0] text-[#7c7a73]"
                  }`}
                >
                  {u.role === "admin" ? "管理员" : "用户"}
                </button>
              </td>
              <td className="px-5 py-3.5 text-sm text-[#7c7a73]">
                {new Date(u.created_at).toLocaleDateString("zh-CN")}
              </td>
              <td className="px-5 py-3.5 text-right">
                <button
                  onClick={() => setPendingAction({ type: "delete", user: u })}
                  disabled={u.id === currentUserId}
                  className="rounded-lg border border-[#e8e6e0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#7c7a73] transition-colors hover:border-[#d94452] hover:text-[#d94452] disabled:cursor-not-allowed disabled:opacity-40"
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
      <div className="flex items-center justify-between border-t border-[#e8e6e0] px-5 py-3 text-xs text-[#7c7a73]">
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
    <div className="rounded-xl border border-[#e8e6e0] bg-white p-5 transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#7c7a73]">
        {icon}
        {label}
      </div>
      <div
        className="mb-1.5 text-[28px] font-extrabold leading-tight tabular-nums"
        style={{ color: highlight ? "#c9a030" : undefined }}
      >
        {value.toLocaleString()}
      </div>
      <div className={highlight ? "text-xs text-[#c9a030]" : "text-xs text-[#7c7a73]"}>
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
          ? "border-[#e85d3a] bg-[#e85d3a] text-white"
          : "border-[#e8e6e0] bg-white text-[#7c7a73] hover:border-[#1a1917] hover:text-[#1a1917]"
      } ${disabled ? "opacity-30" : ""}`}
    >
      {children}
    </button>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 size={24} className="animate-spin text-[#9f9890]" />
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
    <div className="rounded-lg border border-[#edc8c4] bg-[#fff7f5] p-5">
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#d94452]" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-[#7f3525]">数据加载失败</div>
          <div className="mt-1 text-xs text-[#7f3525]">{message}</div>
        </div>
        <button
          onClick={onRetry}
          className="rounded-md border border-[#edc8c4] bg-white px-3 py-1.5 text-xs font-medium text-[#7f3525]"
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
          ? "border-[#edc8c4] bg-[#fff7f5] text-[#7f3525]"
          : "border-[#cce4d5] bg-[#f2faf5] text-[#256b43]"
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
