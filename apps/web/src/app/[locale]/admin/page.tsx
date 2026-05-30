"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Shield, Users, FileText, BarChart3, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  getAdminStats,
  listAdminUsers,
  listAdminPosts,
  deleteAdminUser,
  deleteAdminPost,
  updateAdminUser,
  batchDeleteAdminUsers,
  batchDeleteAdminPosts,
} from "@/lib/api";
import type { AdminStats, AdminUser, AdminPost } from "@/types/forkfit";

type Tab = "stats" | "users" | "posts";

export default function AdminPage() {
  return (
    <AuthGuard>
      <AppShell>
        <AdminContent />
      </AppShell>
    </AuthGuard>
  );
}

function AdminContent() {
  const t = useTranslations("Admin");
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("stats");

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Shield size={48} className="mx-auto mb-4 text-[#9f9890]" />
          <h1 className="text-xl font-semibold">{t("accessDenied")}</h1>
          <p className="mt-2 text-sm text-[#6f6a61]">{t("accessDeniedDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>

      <div className="mb-6 flex gap-1 rounded-lg border border-[#e4ded6] bg-white p-1">
        {(["stats", "users", "posts"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
              tab === key
                ? "bg-[#f5f0ea] font-medium text-[#1f1f1f]"
                : "text-[#6f6a61] hover:text-[#1f1f1f]"
            }`}
          >
            {key === "stats" && <BarChart3 size={16} />}
            {key === "users" && <Users size={16} />}
            {key === "posts" && <FileText size={16} />}
            {t(key)}
          </button>
        ))}
      </div>

      {tab === "stats" && <StatsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "posts" && <PostsTab />}
    </section>
  );
}

function StatsTab() {
  const t = useTranslations("Admin");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (!stats) return null;

  const cards = [
    { label: t("totalUsers"), value: stats.user_count, icon: Users },
    { label: t("totalPosts"), value: stats.post_count, icon: FileText },
    { label: t("activeRuns"), value: stats.active_runs, icon: BarChart3 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f5f0ea]">
              <Icon size={20} className="text-[#7b6f61]" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{value}</p>
              <p className="text-sm text-[#6f6a61]">{label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersTab() {
  const t = useTranslations("Admin");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    listAdminUsers(limit, page * limit)
      .then((res) => { setUsers(res.users); setTotal(res.total); })
      .finally(() => setLoading(false));
  }, [page]);

  const allSelected = users.length > 0 && users.every((u) => selected.has(u.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRole(u: AdminUser) {
    const newRole = u.role === "admin" ? "user" : "admin";
    updateAdminUser(u.id, { role: newRole }).then((updated) => {
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? { ...x, role: updated.role } : x)));
    });
  }

  function handleDelete(u: AdminUser) {
    if (!confirm(t("confirmDeleteUser", { name: u.username }))) return;
    deleteAdminUser(u.id).then(() => {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setTotal((prev) => prev - 1);
      setSelected((prev) => { const n = new Set(prev); n.delete(u.id); return n; });
    });
  }

  function handleBatchDelete() {
    const ids = Array.from(selected);
    if (!confirm(t("confirmBatchDelete", { count: ids.length }))) return;
    batchDeleteAdminUsers(ids).then(() => {
      setUsers((prev) => prev.filter((u) => !selected.has(u.id)));
      setTotal((prev) => prev - ids.length);
      setSelected(new Set());
    });
  }

  if (loading) return <Loading />;

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#e8a9a0] bg-[#fff8f5] px-4 py-2.5">
          <span className="text-sm text-[#7f3525]">{t("selectedCount", { count: selected.size })}</span>
          <button
            onClick={handleBatchDelete}
            className="inline-flex items-center gap-1 rounded-md bg-[#9e3a2b] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#7f2d20]"
          >
            <Trash2 size={12} />
            {t("batchDelete")}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-[#6f6a61] hover:text-[#1f1f1f]">
            {t("cancel")}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[#e4ded6] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e4ded6] bg-[#fafafa]">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-[#d8d0c6] accent-[#2f2a24]"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6a61]">{t("username")}</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6a61]">{t("displayName")}</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6a61]">{t("role")}</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6a61]">{t("created")}</th>
              <th className="px-4 py-3 text-right font-medium text-[#6f6a61]">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-b border-[#f0ebe4] last:border-0 ${selected.has(u.id) ? "bg-[#f5f0ea]" : ""}`}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    className="h-4 w-4 rounded border-[#d8d0c6] accent-[#2f2a24]"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3 text-[#6f6a61]">{u.display_name}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleRole(u)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      u.role === "admin"
                        ? "bg-[#2f6b45] text-white"
                        : "bg-[#f0ebe4] text-[#6f6a61]"
                    }`}
                  >
                    {u.role}
                  </button>
                </td>
                <td className="px-4 py-3 text-[#6f6a61]">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(u)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#e8a9a0] px-2.5 py-1 text-xs text-[#9e3a2b] hover:bg-[#fdf0ee]"
                  >
                    <Trash2 size={12} />
                    {t("delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
    </div>
  );
}

function PostsTab() {
  const t = useTranslations("Admin");
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    listAdminPosts(limit, page * limit)
      .then((res) => { setPosts(res.posts); setTotal(res.total); })
      .finally(() => setLoading(false));
  }, [page]);

  const allSelected = posts.length > 0 && posts.every((p) => selected.has(p.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map((p) => p.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDelete(p: AdminPost) {
    if (!confirm(t("confirmDeletePost", { title: p.title }))) return;
    deleteAdminPost(p.id).then(() => {
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
      setTotal((prev) => prev - 1);
      setSelected((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
    });
  }

  function handleBatchDelete() {
    const ids = Array.from(selected);
    if (!confirm(t("confirmBatchDelete", { count: ids.length }))) return;
    batchDeleteAdminPosts(ids).then(() => {
      setPosts((prev) => prev.filter((p) => !selected.has(p.id)));
      setTotal((prev) => prev - ids.length);
      setSelected(new Set());
    });
  }

  if (loading) return <Loading />;

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#e8a9a0] bg-[#fff8f5] px-4 py-2.5">
          <span className="text-sm text-[#7f3525]">{t("selectedCount", { count: selected.size })}</span>
          <button
            onClick={handleBatchDelete}
            className="inline-flex items-center gap-1 rounded-md bg-[#9e3a2b] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#7f2d20]"
          >
            <Trash2 size={12} />
            {t("batchDelete")}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-[#6f6a61] hover:text-[#1f1f1f]">
            {t("cancel")}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[#e4ded6] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e4ded6] bg-[#fafafa]">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-[#d8d0c6] accent-[#2f2a24]"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6a61]">{t("title")}</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6a61]">{t("author")}</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6a61]">{t("created")}</th>
              <th className="px-4 py-3 text-right font-medium text-[#6f6a61]">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id} className={`border-b border-[#f0ebe4] last:border-0 ${selected.has(p.id) ? "bg-[#f5f0ea]" : ""}`}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="h-4 w-4 rounded border-[#d8d0c6] accent-[#2f2a24]"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{p.title}</td>
                <td className="px-4 py-3 text-[#6f6a61]">{p.author}</td>
                <td className="px-4 py-3 text-[#6f6a61]">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(p)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#e8a9a0] px-2.5 py-1 text-xs text-[#9e3a2b] hover:bg-[#fdf0ee]"
                  >
                    <Trash2 size={12} />
                    {t("delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
    </div>
  );
}

function Pagination({ page, total, limit, onPageChange }: {
  page: number; total: number; limit: number; onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-[#6f6a61]">
      <span>{total} items</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
          className="rounded p-1 hover:bg-[#f0ebe4] disabled:opacity-30"><ChevronLeft size={16} /></button>
        <span>{page + 1} / {totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
          className="rounded p-1 hover:bg-[#f0ebe4] disabled:opacity-30"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 size={24} className="animate-spin text-[#9f9890]" />
    </div>
  );
}
