"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Heart, Bookmark, MessageSquare, Settings, Trash2, Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { PostCard } from "@/components/post-card";
import { ProfileForm } from "./profile-form";
import { listLikedPosts, listSavedPosts, listMyComments, deleteComment } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

type Tab = "preferences" | "liked" | "saved" | "comments";

export default function ProfilePage() {
  return (
    <AuthGuard>
      <AppShell>
        <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <ProfileContent />
        </section>
      </AppShell>
    </AuthGuard>
  );
}

function ProfileContent() {
  const t = useTranslations("Profile");
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("preferences");

  return (
    <div>
      {/* User header */}
      <div className="mb-6 flex items-center gap-4 rounded-lg border border-[#e4ded6] bg-white p-5">
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e4ded6] text-xl font-medium text-[#6f6a61]">
            {(user?.display_name || user?.username || "?")[0].toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold">{user?.display_name}</h1>
          <p className="text-sm text-[#6f6a61]">@{user?.username}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-[#e4ded6] bg-white p-1">
        {([
          { key: "preferences" as Tab, icon: Settings, label: t("tabs.preferences") },
          { key: "liked" as Tab, icon: Heart, label: t("tabs.liked") },
          { key: "saved" as Tab, icon: Bookmark, label: t("tabs.saved") },
          { key: "comments" as Tab, icon: MessageSquare, label: t("tabs.comments") },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
              tab === key
                ? "bg-[#f5f0ea] font-medium text-[#1f1f1f]"
                : "text-[#6f6a61] hover:text-[#1f1f1f]"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "preferences" && <ProfileForm />}
      {tab === "liked" && <LikedTab />}
      {tab === "saved" && <SavedTab />}
      {tab === "comments" && <CommentsTab />}
    </div>
  );
}

function LikedTab() {
  const t = useTranslations("Profile");
  const [posts, setPosts] = useState<RecipePost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listLikedPosts(50, 0).then(setPosts).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (posts.length === 0) return <EmptyState message={t("noLiked")} />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function SavedTab() {
  const t = useTranslations("Profile");
  const [posts, setPosts] = useState<RecipePost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSavedPosts(50, 0).then(setPosts).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (posts.length === 0) return <EmptyState message={t("noSaved")} />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function CommentsTab() {
  const t = useTranslations("Profile");
  const [comments, setComments] = useState<{ id: string; post_id: string; content: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyComments(50, 0).then((res) => setComments(res.comments)).finally(() => setLoading(false));
  }, []);

  function handleDelete(commentId: string) {
    if (!confirm(t("confirmDeleteComment"))) return;
    // We need the post_id to delete, but we don't have it in the list
    // The delete endpoint needs post_id, so we'll find it from the comment
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;
    deleteComment(comment.post_id, commentId).then(() => {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    });
  }

  if (loading) return <LoadingSpinner />;
  if (comments.length === 0) return <EmptyState message={t("noComments")} />;

  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <div key={c.id} className="rounded-lg border border-[#e4ded6] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#5f5a52]">{c.content}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-[#9f9890]">
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
                <a href={`/packs/${c.post_id}`} className="text-[#7b6f61] hover:underline">
                  {t("viewPost")}
                </a>
              </div>
            </div>
            <button
              onClick={() => handleDelete(c.id)}
              className="shrink-0 rounded p-1 text-[#9f9890] hover:text-[#9e3a2b]"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 size={24} className="animate-spin text-[#9f9890]" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-sm text-[#9f9890]">
      {message}
    </div>
  );
}
