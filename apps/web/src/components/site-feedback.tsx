"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { useAuth } from "@/components/auth-provider";
import { Link } from "@/i18n/routing";
import { listSiteFeedback, submitSiteFeedback, updateSiteFeedback, type SiteFeedback } from "@/lib/api";

const categories = {
  bug: ["遇到问题", "Report a problem"],
  suggestion: ["建议", "Suggestion"],
  data_request: ["数据导出或删除申请", "Data export or deletion"],
} as const;

export function SiteFeedbackPanel() {
  const { user, loading } = useAuth();
  const zh = useLocale() === "zh";
  const cache = useQueryClient();
  const [category, setCategory] = useState<SiteFeedback["category"]>("bug");
  const [content, setContent] = useState("");
  const attempt = useRef({ fingerprint: "", id: "" });
  const send = useMutation({
    mutationFn: submitSiteFeedback,
    onSuccess: () => {
      setContent("");
      attempt.current = { fingerprint: "", id: "" };
      void cache.invalidateQueries({ queryKey: ["site-feedback"] });
    },
  });

  if (loading) return <p role="status">{zh ? "正在加载…" : "Loading…"}</p>;
  if (!user) return <Link className="button-secondary mt-4" href="/login?returnTo=%2Fhelp%23feedback">{zh ? "登录后提交反馈" : "Sign in to send feedback"}</Link>;

  return <div className="mt-4 space-y-8">
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      if (send.isPending || !content.trim()) return;
      const fingerprint = JSON.stringify([category, content.trim()]);
      if (attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
      send.mutate({ request_id: attempt.current.id, category, content: content.trim() });
    }}>
      <div><label className="mb-2 block" htmlFor="feedback-category">{zh ? "反馈类型" : "Category"}</label>
        <select className="input w-full" id="feedback-category" value={category} disabled={send.isPending} onChange={(event) => { setCategory(event.target.value as SiteFeedback["category"]); send.reset(); }}>
          {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label[zh ? 0 : 1]}</option>)}
        </select></div>
      <div><label className="mb-2 block" htmlFor="feedback-content">{zh ? "具体内容" : "Details"}</label>
        <textarea className="textarea min-h-32 w-full" id="feedback-content" required maxLength={2000} value={content} disabled={send.isPending} onChange={(event) => { setContent(event.target.value); send.reset(); }} />
      </div>
      {category === "data_request" && <p className="text-sm">{zh ? "申请由管理员核实后人工处理，提交不会自动删除数据。" : "Requests are verified and handled manually; submitting does not delete data."}</p>}
      {send.isError && <p role="alert">{send.error.message}</p>}
      {send.isSuccess && <p role="status">{zh ? "已提交，可在下方查看处理进度和回复。" : "Submitted. Track progress and replies below."}</p>}
      <button className="button-primary" disabled={send.isPending || !content.trim()} type="submit">{send.isPending ? (zh ? "提交中…" : "Sending…") : (zh ? "提交反馈" : "Send feedback")}</button>
    </form>
    <section><h3 className="section-heading mb-4">{zh ? "我的反馈" : "My feedback"}</h3><SiteFeedbackList /></section>
  </div>;
}

export function SiteFeedbackList({ admin = false, refreshKey = 0 }: { admin?: boolean; refreshKey?: number }) {
  const { user } = useAuth();
  const locale = useLocale();
  const zh = locale === "zh";
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const query = useQuery({
    queryKey: ["site-feedback", user?.id, admin, offset, status, refreshKey],
    queryFn: () => listSiteFeedback(admin, offset, status),
    enabled: Boolean(user),
  });
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      {admin && <><label htmlFor="feedback-status">处理状态</label><select className="input max-w-48" id="feedback-status" value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="">全部</option><option value="open">待处理</option><option value="resolved">已处理</option></select></>}
      <button className="button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{zh ? "刷新反馈" : "Refresh feedback"}</button>
    </div>
    {query.isPending && <p role="status">{zh ? "正在加载反馈…" : "Loading feedback…"}</p>}
    {query.isError && <p role="alert">{zh ? "反馈列表加载失败，请刷新重试。" : "Feedback could not be loaded. Please retry."}</p>}
    {!query.isPending && !query.isError && query.data?.items.length === 0 && <p>{zh ? "暂无反馈" : "No feedback yet"}</p>}
    {query.data?.items.map((item) => <article key={item.id} className="min-w-0 space-y-3 border-b border-[var(--border)] py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><strong>{categories[item.category][zh ? 0 : 1]}</strong><span>{item.status === "open" ? (zh ? "待处理" : "Open") : (zh ? "已处理" : "Resolved")}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(locale)}</time></div>
      {admin && <p className="break-all text-sm">用户 ID：{item.user_id}</p>}
      <p className="whitespace-pre-wrap break-words">{item.content}</p>
      {item.reply && <p className="whitespace-pre-wrap break-words"><strong>{zh ? "管理员回复：" : "Admin reply: "}</strong>{item.reply}</p>}
      {admin && <FeedbackEditor key={`${item.id}:${item.updated_at}`} item={item} />}
    </article>)}
    {(offset > 0 || (query.data?.total ?? 0) > 20) && <div className="flex gap-3">
      <button className="button-secondary" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - 20))}>{zh ? "上一页" : "Previous"}</button>
      <button className="button-secondary" disabled={query.isFetching || !query.data || offset + 20 >= query.data.total} onClick={() => setOffset(offset + 20)}>{zh ? "下一页" : "Next"}</button>
    </div>}
  </div>;
}

function FeedbackEditor({ item }: { item: SiteFeedback }) {
  const cache = useQueryClient();
  const [reply, setReply] = useState(item.reply);
  const [status, setStatus] = useState(item.status);
  const save = useMutation({
    mutationFn: () => updateSiteFeedback(item.id, { reply: reply.trim(), status }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["site-feedback"] }),
  });
  return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
    <label className="block" htmlFor={`reply-${item.id}`}>回复用户</label>
    <textarea className="textarea min-h-24 w-full" id={`reply-${item.id}`} maxLength={2000} value={reply} disabled={save.isPending} onChange={(event) => setReply(event.target.value)} />
    <div className="flex flex-wrap items-center gap-3"><label htmlFor={`status-${item.id}`}>处理状态</label><select className="input max-w-48" id={`status-${item.id}`} value={status} disabled={save.isPending} onChange={(event) => setStatus(event.target.value as SiteFeedback["status"])}><option value="open">待处理</option><option value="resolved">已处理</option></select><button className="button-secondary" disabled={save.isPending || (reply.trim() === item.reply && status === item.status)}>{save.isPending ? "保存中…" : "保存处理结果"}</button></div>
    {save.isError && <p role="alert">{save.error.message}</p>}
  </form>;
}
