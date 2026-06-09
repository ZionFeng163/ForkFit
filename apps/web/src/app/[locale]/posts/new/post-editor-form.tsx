"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Info, Loader2, Plus, Send, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useCallback, useRef, useState } from "react";

import { ImageUpload } from "@/components/image-upload";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "@/i18n/routing";
import { createPost, extractPost, updatePost } from "@/lib/api";
import type { CreatePostInput, RecipePost } from "@/types/forkfit";

/* ─── Types ─── */
type PostFormState = {
  title: string;
  theme: string;
  location: string;
  image_urls: string[];
  description: string;
  recipe_name: string;
  ingredients: string[];
  equipment: string[];
  cook_time_minutes: number;
  estimated_cost: string;
  tags: string[];
  notes: string;
  steps: string[];
};

const defaultForm: PostFormState = {
  title: "",
  theme: "",
  location: "",
  image_urls: [],
  description: "",
  recipe_name: "",
  ingredients: [],
  equipment: [],
  cook_time_minutes: 15,
  estimated_cost: "10",
  tags: [],
  notes: "",
  steps: ["", "", ""],
};

const TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
const DIFFICULTY_OPTIONS = [
  { key: "easy", label: { zh: "简单", en: "Easy" } },
  { key: "medium", label: { zh: "中等", en: "Medium" } },
  { key: "hard", label: { zh: "较难", en: "Hard" } },
];

/* ─── Tag Input ─── */
function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = (inputRef.current?.value || "").trim().replace(/,/g, "");
      if (val && !tags.includes(val)) {
        onChange([...tags, val]);
      }
      if (inputRef.current) inputRef.current.value = "";
    }
    if (e.key === "Backspace" && !(inputRef.current?.value) && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  function removeTag(idx: number) {
    onChange(tags.filter((_, i) => i !== idx));
  }

  return (
    <div className="fp-tag-wrap" onClick={() => inputRef.current?.focus()}>
      {tags.map((tag, i) => (
        <span key={i} className="fp-tag-item">
          {tag}
          <button type="button" onClick={() => removeTag(i)} className="fp-tag-remove">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        placeholder={tags.length === 0 ? placeholder : ""}
        onKeyDown={handleKeyDown}
        className="fp-tag-input"
      />
    </div>
  );
}

/* ─── Main Form ─── */
export function PostEditorForm({ post }: { post?: RecipePost }) {
  const t = useTranslations("NewPost");
  const router = useRouter();
  const { user } = useAuth();
  const isEditing = Boolean(post);
  const [form, setForm] = useState<PostFormState>(() =>
    post ? formFromPost(post) : defaultForm
  );
  const [difficulty, setDifficulty] = useState("easy");

  const mutation = useMutation({
    mutationFn: (input: CreatePostInput) =>
      post ? updatePost(post.id, input) : createPost(input),
    onSuccess: (savedPost) => {
      router.push(`/packs/${savedPost.id}`);
    },
  });

  const extractMutation = useMutation({
    mutationFn: () => {
      if (!post) throw new Error("Post is required.");
      return extractPost(post.id);
    },
    onSuccess: (savedPost) => {
      setForm(formFromPost(savedPost));
      router.push(`/packs/${savedPost.id}/edit`);
    },
  });

  function update<K extends keyof PostFormState>(key: K, value: PostFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleStepChange(index: number, value: string) {
    const steps = [...form.steps];
    steps[index] = value;
    update("steps", steps);
  }

  function addStep() {
    update("steps", [...form.steps, ""]);
  }

  function removeStep(index: number) {
    if (form.steps.length <= 1) return;
    update("steps", form.steps.filter((_, i) => i !== index));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate(buildInput(form, difficulty));
  }

  function submitAndExtract() {
    if (!post) return;
    mutation.mutate(buildInput(form, difficulty), {
      onSuccess: () => extractMutation.mutate(),
    });
  }

  const isPending = mutation.isPending || extractMutation.isPending;

  return (
    <form onSubmit={submit}>
      <div className="mx-auto max-w-[960px] px-7 pb-20">
        {/* Back */}
        <div className="pt-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
            style={{ color: "var(--lp-muted)" }}
          >
            <ArrowLeft size={16} />
            {t("back")}
          </button>
        </div>

        {/* Page header */}
        <div className="mt-7 mb-8">
          <h1 className="text-2xl font-bold tracking-[-0.01em] mb-1.5" style={{ color: "var(--lp-fg)" }}>
            {isEditing ? t("editTitle") : t("title")}
          </h1>
          <p className="text-sm leading-[1.6]" style={{ color: "var(--lp-muted)" }}>
            {t("description")}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div style={{ display: "flex", gap: 0 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: "3px",
                  borderRadius: "999px",
                  background: i < 1
                    ? "var(--lp-accent)"
                    : i === 1
                    ? "linear-gradient(90deg, var(--lp-accent) 0%, var(--lp-border) 100%)"
                    : "var(--lp-border)",
                }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {["基本信息", "菜谱详情", "发布"].map((label, i) => (
              <span
                key={i}
                className="text-[11px] font-medium transition-colors"
                style={{ color: i === 0 ? "var(--lp-accent)" : "var(--lp-muted)" }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
          {/* ── Left: Form ── */}
          <div>
            {/* Section 1: Basic Info */}
            <div className="rounded-xl p-7 mb-5" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
              <h2 className="text-[15px] font-bold mb-5 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                基本信息
              </h2>

              {/* Title */}
              <div className="mb-5">
                <label className="block text-[13px] font-semibold mb-1.5">
                  菜谱标题 <span style={{ color: "var(--lp-accent)" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="例如：外婆红烧肉、五分钟快手早餐"
                  className="fp-input"
                />
                <div className="text-xs mt-1" style={{ color: "var(--lp-muted)" }}>取一个让人看了就想做的名字</div>
              </div>

              {/* Description */}
              <div className="mb-5">
                <label className="block text-[13px] font-semibold mb-1.5">
                  菜谱描述 <span style={{ color: "var(--lp-accent)" }}>*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="简单描述这道菜的特色、灵感来源、适合什么场景…"
                  className="fp-textarea"
                />
              </div>

              {/* Images */}
              <div>
                <label className="block text-[13px] font-semibold mb-1.5">菜谱图片</label>
                <ImageUpload
                  images={form.image_urls}
                  onChange={(urls) => update("image_urls", urls)}
                />
              </div>
            </div>

            {/* Section 2: Recipe Details */}
            <div className="rounded-xl p-7 mb-5" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
              <h2 className="text-[15px] font-bold mb-5 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                菜谱详情
              </h2>

              {/* Cook time */}
              <div className="mb-5">
                <label className="block text-[13px] font-semibold mb-2">烹饪时间</label>
                <div className="flex flex-wrap gap-2">
                  {TIME_OPTIONS.map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => update("cook_time_minutes", min)}
                      className="px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-150"
                      style={{
                        border: `1.5px solid ${form.cook_time_minutes === min ? "var(--lp-accent)" : "var(--lp-border)"}`,
                        background: form.cook_time_minutes === min ? "var(--lp-accent-light)" : "var(--lp-surface)",
                        color: form.cook_time_minutes === min ? "var(--lp-accent)" : "var(--lp-muted)",
                      }}
                    >
                      {min >= 60 ? "1 小时+" : `${min} 分钟`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div className="mb-5">
                <label className="block text-[13px] font-semibold mb-2">难度</label>
                <div className="flex gap-2">
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setDifficulty(d.key)}
                      className="flex-1 py-3 rounded-lg text-center transition-all duration-150"
                      style={{
                        border: `1.5px solid ${difficulty === d.key ? "var(--lp-accent)" : "var(--lp-border)"}`,
                        background: difficulty === d.key ? "var(--lp-accent-light)" : "var(--lp-surface)",
                      }}
                    >
                      <span className="text-[13px] font-semibold" style={{ color: difficulty === d.key ? "var(--lp-accent)" : "var(--lp-fg-secondary, var(--lp-muted))" }}>
                        {d.label.zh}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ingredients */}
              <div className="mb-5">
                <label className="block text-[13px] font-semibold mb-1.5">食材清单</label>
                <TagInput tags={form.ingredients} onChange={(t) => update("ingredients", t)} placeholder="输入食材后按回车添加" />
                <div className="text-xs mt-1" style={{ color: "var(--lp-muted)" }}>逐一输入食材名称，按回车分隔</div>
              </div>

              {/* Equipment */}
              <div className="mb-5">
                <label className="block text-[13px] font-semibold mb-1.5">厨具</label>
                <TagInput tags={form.equipment} onChange={(t) => update("equipment", t)} placeholder="输入厨具后按回车添加" />
                <div className="text-xs mt-1" style={{ color: "var(--lp-muted)" }}>例如：炒锅、烤箱、空气炸锅</div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-[13px] font-semibold mb-1.5">标签</label>
                <TagInput tags={form.tags} onChange={(t) => update("tags", t)} placeholder="输入标签后按回车添加" />
                <div className="text-xs mt-1" style={{ color: "var(--lp-muted)" }}>例如：家常菜、快手菜、减脂、早餐</div>
              </div>
            </div>

            {/* Section 3: Cooking Steps */}
            <div className="rounded-xl p-7" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
              <h2 className="text-[15px] font-bold mb-5 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                烹饪步骤
              </h2>

              <div className="fp-steps">
                {form.steps.map((step, i) => (
                  <div key={i} className="fp-step">
                    <div className="fp-step-num">{i + 1}</div>
                    <input
                      type="text"
                      value={step}
                      onChange={(e) => handleStepChange(i, e.target.value)}
                      placeholder={`第${i + 1}步`}
                      className="fp-input"
                    />
                    <button type="button" onClick={() => removeStep(i)} className="fp-step-remove">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" onClick={addStep} className="fp-add-step">
                <Plus size={14} />
                添加步骤
              </button>

              {/* Notes */}
              <div className="mt-5">
                <label className="block text-[13px] font-semibold mb-1.5">小贴士</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="例如：番茄要选熟透的、蛋不要炒太老…"
                  className="fp-textarea"
                />
              </div>
            </div>
          </div>

          {/* ── Right: Sidebar ── */}
          <div className="fp-side-panel">
            {/* Publish card */}
            <div className="fp-publish-card">
              <p>{t("publishHelp")}</p>

              {mutation.error || extractMutation.error ? (
                <div className="mb-4 p-3 rounded-lg text-[13px]" style={{ border: "1px solid #e1b7a9", background: "#fff8f5", color: "#7f3525" }}>
                  {mutation.error?.message || extractMutation.error?.message || t("failed")}
                </div>
              ) : null}

              <button type="submit" disabled={isPending} className="fp-btn-publish">
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {isEditing ? t("save") : t("submit")}
              </button>

              {isEditing && (
                <button type="button" disabled={isPending} onClick={submitAndExtract} className="fp-btn-draft">
                  {extractMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />{t("extracting")}</span>
                  ) : t("saveAndExtract")}
                </button>
              )}
            </div>

            {/* Tips card */}
            <div className="fp-tips">
              <div className="fp-tips-title">
                <Info size={15} />
                发布小贴士
              </div>
              <ul className="fp-tips-list">
                {[
                  "清晰的成品图能大幅提升收藏率",
                  "食材写清用量，例如「鸡蛋 2 个」",
                  "步骤越细越好，新手也能跟着做",
                  "加上标签更容易被搜索到",
                  "小贴士写上你的独门秘诀",
                ].map((tip, i) => (
                  <li key={i}>
                    <span className="fp-tips-num">{i + 1}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

export function NewPostForm() {
  return <PostEditorForm />;
}

/* ─── Helpers ─── */
function buildInput(form: PostFormState, difficulty: string): CreatePostInput {
  const title = form.title.trim();
  const recipeName = form.recipe_name.trim() || title;
  const description = form.description.trim();
  const allTags = [...form.tags];
  if (difficulty && !allTags.includes(difficulty)) allTags.unshift(difficulty);
  const steps = form.steps.filter((s) => s.trim());

  return {
    title,
    theme: form.theme.trim() || "community recipe",
    location: form.location.trim() || "unknown",
    image_urls: form.image_urls.filter(Boolean),
    description,
    recipe: {
      id: "main",
      day: "post",
      name: recipeName,
      ingredients: form.ingredients.length ? form.ingredients : [title],
      equipment: form.equipment,
      cook_time_minutes: form.cook_time_minutes || 30,
      estimated_cost: Number(form.estimated_cost) || 10,
      tags: allTags,
      notes: form.notes.trim(),
      steps,
    },
  };
}

function formFromPost(post: RecipePost): PostFormState {
  return {
    title: post.title,
    theme: post.theme === "community recipe" ? "" : post.theme,
    location: post.location === "unknown" ? "" : post.location,
    image_urls: [...post.image_urls],
    description: post.description,
    recipe_name: post.recipe.name === post.title ? "" : post.recipe.name,
    ingredients:
      post.recipe.ingredients.length === 1 && post.recipe.ingredients[0] === post.title
        ? []
        : [...post.recipe.ingredients],
    equipment: [...post.recipe.equipment],
    cook_time_minutes: post.recipe.cook_time_minutes || 30,
    estimated_cost: String(post.recipe.estimated_cost || 10),
    tags: post.recipe.tags.filter((t) => !["easy", "medium", "hard"].includes(t)),
    notes: post.recipe.notes,
    steps: post.recipe.steps?.length ? [...post.recipe.steps] : ["", "", ""],
  };
}
