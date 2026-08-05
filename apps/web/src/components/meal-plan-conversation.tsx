"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, Check, Loader2, MessageCircle, RotateCcw } from "lucide-react";
import { useLocale } from "next-intl";

import {
  confirmMealPlanMessage,
  getMealPlanConversation,
  sendMealPlanMessage,
} from "@/lib/api";

type Props = {
  planId: string;
  currentVersionId?: string | null;
  onVersionChanged: () => void;
};

const SUGGESTIONS = [
  "第二天换一道更快的",
  "这几天蔬菜多一些",
  "不要用烤箱",
  "解释一下为什么这样安排",
  "恢复上一版",
];

export function MealPlanConversation({ planId, currentVersionId, onVersionChanged }: Props) {
  const locale = useLocale();
  const isZh = locale === "zh";
  const [text, setText] = useState("");
  const conversation = useQuery({
    queryKey: ["meal-plan-conversation", planId],
    queryFn: () => getMealPlanConversation(planId),
    refetchInterval: (state) => {
      const messages = state.state.data?.messages ?? [];
      return messages.some((message) => ["queued", "processing"].includes(message.status))
        ? 1200
        : false;
    },
  });
  const send = useMutation({
    mutationFn: (value: string) => sendMealPlanMessage(planId, {
      text: value,
      base_version_id: currentVersionId,
      locale,
    }),
    onSuccess: () => {
      setText("");
      void conversation.refetch();
    },
  });
  const confirm = useMutation({
    mutationFn: (messageId: string) => confirmMealPlanMessage(planId, messageId),
    onSuccess: () => void conversation.refetch(),
  });

  const messages = useMemo(
    () => (conversation.data?.messages ?? []).slice(-8),
    [conversation.data?.messages],
  );
  const pendingMessage = conversation.data?.messages.find(
    (message) => message.message_id === conversation.data?.pending_message_id,
  );
  const isWaitingForMessage = pendingMessage && ["queued", "processing", "needs_confirmation"].includes(pendingMessage.status);
  const failedMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user" && message.status === "failed");

  useEffect(() => {
    const nextVersion = conversation.data?.current_version_id;
    if (nextVersion && nextVersion !== currentVersionId) onVersionChanged();
  }, [conversation.data?.current_version_id, currentVersionId, onVersionChanged]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || send.isPending) return;
    send.mutate(value);
  }

  return (
    <section className="plan-conversation-panel mt-10 border-t border-[var(--line)] pt-8" aria-label={isZh ? "继续调整菜单" : "Continue adjusting"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle size={18} className="text-[var(--brand)]" />
            <h2 className="section-heading">{isZh ? "继续调整" : "Keep refining"}</h2>
          </div>
          <p className="mt-2 text-sm text-[var(--muted-text)]">
            {isZh ? "不满意的地方直接告诉我，当前菜单会保留在历史版本里。" : "Tell us what feels off and keep this plan as your starting point."}
          </p>
        </div>
        {conversation.isFetching && <Loader2 size={16} className="mt-1 animate-spin text-[var(--muted-text)]" />}
      </div>

      {messages.length > 0 && (
        <div className="conversation-messages mt-5 space-y-3">
          {messages.map((message) => (
            <div key={message.message_id} className={message.role === "user" ? "ml-auto max-w-[88%] rounded-lg bg-[var(--brand-soft)] px-4 py-3 text-sm" : "max-w-[88%] rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm"}>
              <p className="leading-6">
                {message.role === "assistant" ? (message.response?.message || message.content) : message.content}
              </p>
              {message.role === "assistant" && message.response?.changes?.length ? (
                <div className="mt-3 space-y-1 border-t border-[var(--line)] pt-2 text-xs text-[var(--muted-text)]">
                  {message.response.changes.map((change) => (
                    <p key={`${message.message_id}-${change.day_index}`}>
                      第 {change.day_index} 天：{change.before} → {change.after}
                      {change.changed_fields?.length ? `（${change.changed_fields.join("、")}）` : ""}
                    </p>
                  ))}
                </div>
              ) : null}
              {message.status === "processing" || message.status === "queued" ? (
                <span className="mt-2 flex items-center gap-1.5 text-xs text-[var(--muted-text)]"><Loader2 size={12} className="animate-spin" />{isZh ? "正在调整…" : "Working…"}</span>
              ) : null}
              {message.status === "failed" && (
                <span className="mt-2 block text-xs text-[var(--danger)]">{message.error?.message || (isZh ? "这次修改没有应用。" : "This change was not applied.")}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingMessage?.status === "needs_confirmation" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-sm">
          <span>{pendingMessage.response?.message || (isZh ? "这次修改会影响整份菜单。" : "This change affects the whole plan.")}</span>
          <button
            type="button"
            className="button-primary h-9 min-h-9"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate(pendingMessage.message_id)}
          >
            {confirm.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isZh ? "确认调整" : "Apply change"}
          </button>
        </div>
      )}

      <form className="mt-5 flex items-end gap-2" onSubmit={submit}>
        <textarea
          className="textarea min-h-12 flex-1 resize-none"
          value={text}
          maxLength={1500}
          onChange={(event) => setText(event.target.value)}
          placeholder={isZh ? "例如：第二天不要鱼，换成一道 30 分钟内的鸡肉菜……" : "For example: replace day two with a chicken dish under 30 minutes…"}
          aria-label={isZh ? "输入菜单修改" : "Describe a menu change"}
        />
        <button type="submit" className="button-primary h-12 min-h-12 w-12 px-0" disabled={!text.trim() || send.isPending || Boolean(isWaitingForMessage)} aria-label={isZh ? "发送修改" : "Send change"}>
          {send.isPending ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={17} />}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {failedMessage && (
          <button
            type="button"
            className="meal-plan-example"
            disabled={send.isPending}
            onClick={() => send.mutate(failedMessage.content)}
          >
            <RotateCcw size={13} />
            {isZh ? "重试上一次" : "Retry last change"}
          </button>
        )}
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" className="meal-plan-example" onClick={() => setText(suggestion)}>
            {suggestion === "恢复上一版" && <RotateCcw size={13} />}
            {suggestion}
          </button>
        ))}
      </div>
      {(send.isError || confirm.isError) && (
        <p className="mt-3 text-sm text-[var(--danger)]">
          {(send.error instanceof Error && send.error.message) || (confirm.error instanceof Error && confirm.error.message) || (isZh ? "修改暂时无法提交。" : "Could not submit the change.")}
        </p>
      )}
    </section>
  );
}
