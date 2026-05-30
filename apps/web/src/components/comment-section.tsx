"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Send, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { listComments, createComment, deleteComment, type Comment } from "@/lib/api";

type Props = { postId: string };

export function CommentSection({ postId }: Props) {
  const t = useTranslations("Comments");
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listComments(postId).then((res) => {
      setComments(res.comments);
      setTotal(res.total);
    }).finally(() => setLoading(false));
  }, [postId]);

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
    <div className="mt-8 rounded-lg border border-[#e4ded6] bg-white p-5">
      <h2 className="text-lg font-semibold">{t("title", { count: total })}</h2>

      {/* Comment form */}
      {user ? (
        <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e4ded6] text-xs font-medium text-[#6f6a61]">
            {(user.display_name || user.username || "?")[0].toUpperCase()}
          </div>
          <div className="flex flex-1 gap-2">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("placeholder")}
              className="h-9 flex-1 rounded-md border border-[#d8d0c6] px-3 text-sm outline-none transition-colors focus:border-[#7b6f61]"
            />
            <button
              type="submit"
              disabled={!content.trim() || submitting}
              className="flex h-9 items-center gap-1.5 rounded-md bg-[#2f2a24] px-3 text-sm text-white transition-colors hover:bg-[#4a4338] disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {t("send")}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-[#9f9890]">{t("loginToComment")}</p>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[#9f9890]" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#9f9890]">{t("noComments")}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              {c.avatar_url ? (
                <img src={c.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e4ded6] text-xs font-medium text-[#6f6a61]">
                  {(c.display_name || c.username || "?")[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.display_name}</span>
                  <span className="text-xs text-[#9f9890]">@{c.username}</span>
                  <span className="text-xs text-[#9f9890]">· {new Date(c.created_at).toLocaleDateString()}</span>
                  {c.can_delete ? (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="ml-auto text-[#9f9890] hover:text-[#9e3a2b]"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-[#5f5a52]">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
