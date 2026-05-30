"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Send, Trash2, X } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { listComments, createComment, deleteComment, type Comment } from "@/lib/api";

type Props = {
  postId: string;
  onClose: () => void;
};

export function CommentModal({ postId, onClose }: Props) {
  const t = useTranslations("Comments");
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listComments(postId).then((res) => {
      setComments(res.comments);
      setTotal(res.total);
    }).finally(() => setLoading(false));
    inputRef.current?.focus();
  }, [postId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !user) return;
    setSubmitting(true);
    createComment(postId, content.trim()).then((c) => {
      setComments((prev) => [...prev, c]);
      setTotal((prev) => prev + 1);
      setContent("");
    }).finally(() => setSubmitting(false));
  }

  function handleDelete(commentId: string) {
    if (!confirm(t("confirmDelete"))) return;
    deleteComment(postId, commentId).then(() => {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotal((prev) => prev - 1);
    });
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-[#e4ded6] bg-white shadow-xl" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e4ded6] px-5 py-3">
          <h2 className="text-base font-semibold">{t("title", { count: total })}</h2>
          <button onClick={onClose} className="rounded p-1 text-[#9f9890] hover:bg-[#f0ebe4] hover:text-[#5f5a52]">
            <X size={18} />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[#9f9890]" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#9f9890]">{t("noComments")}</p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e4ded6] text-[11px] font-medium text-[#6f6a61]">
                      {(c.display_name || c.username || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{c.display_name}</span>
                      <span className="text-[11px] text-[#9f9890]">· {new Date(c.created_at).toLocaleDateString()}</span>
                      {c.can_delete ? (
                        <button onClick={() => handleDelete(c.id)} className="ml-auto text-[#9f9890] hover:text-[#9e3a2b]">
                          <Trash2 size={12} />
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-[#5f5a52]">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        {user ? (
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-[#e4ded6] px-5 py-3">
            <input
              ref={inputRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("placeholder")}
              className="h-9 flex-1 rounded-md border border-[#d8d0c6] px-3 text-sm outline-none transition-colors focus:border-[#7b6f61]"
            />
            <button
              type="submit"
              disabled={!content.trim() || submitting}
              className="flex h-9 items-center gap-1 rounded-md bg-[#2f2a24] px-3 text-sm text-white transition-colors hover:bg-[#4a4338] disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </form>
        ) : (
          <div className="border-t border-[#e4ded6] px-5 py-3 text-center text-xs text-[#9f9890]">
            {t("loginToComment")}
          </div>
        )}
      </div>
    </div>
  );
}
