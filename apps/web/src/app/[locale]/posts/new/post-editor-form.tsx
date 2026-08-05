"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Info, Loader2, Plus, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useRef, useState } from "react";

import { ImageUpload } from "@/components/image-upload";
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

function formatDraftTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const isEditing = Boolean(post);
  const [form, setForm] = useState<PostFormState>(() => {
    if (post) return formFromPost(post);
    // Try to load draft from localStorage
    try {
      const raw = localStorage.getItem("forkfit.draft");
      if (raw) {
        const draft = JSON.parse(raw);
        return { ...defaultForm, ...draft };
      }
    } catch {}
    return defaultForm;
  });
  const [difficulty, setDifficulty] = useState(() => {
    if (post?.recipe?.difficulty) return post.recipe.difficulty;
    try {
      const raw = localStorage.getItem("forkfit.draft");
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.difficulty) return draft.difficulty;
        if (draft.recipe?.difficulty) return draft.recipe.difficulty;
      }
    } catch {}
    return "easy";
  });
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(() => {
    try {
      return localStorage.getItem("forkfit.draft.saved_at") || "";
    } catch {
      return "";
    }
  });

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
    localStorage.removeItem("forkfit.draft");
    localStorage.removeItem("forkfit.draft.saved_at");
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
      <div className="site-container max-w-[980px] pb-20">
        {/* Back */}
        <div className="pt-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
            style={{ color: "var(--muted)" }}
          >
            <ArrowLeft size={16} />
            {t("back")}
          </button>
        </div>

        {/* Page header */}
        <div className="mt-7 mb-8">
          <h1 className="text-2xl font-bold tracking-[-0.01em] mb-1.5" style={{ color: "var(--text)" }}>
            {isEditing ? t("editTitle") : t("title")}
          </h1>
          <p className="text-sm leading-[1.6]" style={{ color: "var(--muted)" }}>
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
                  borderRadius: "2px",
                  background: i < 1
                    ? "var(--brand)"
                    : "var(--separator)",
                }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {["基本信息", "菜谱详情", "发布"].map((label, i) => (
              <span
                key={i}
                className="text-[11px] font-medium transition-colors"
                style={{ color: i === 0 ? "var(--brand)" : "var(--muted)" }}
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
            <div className="mb-5 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-7">
              <h2 className="text-[15px] font-bold mb-5 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                基本信息
              </h2>

              {/* Title */}
              <div className="mb-5">
                <label className="block text-[13px] font-semibold mb-1.5">
                  菜谱标题 <span style={{ color: "var(--brand)" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="例如：外婆红烧肉、五分钟快手早餐"
                  className="fp-input"
                />
                <div className="mt-1 flex justify-between gap-3 text-xs text-[var(--muted)]"><span>取一个让人看了就想做的名字</span><span>{form.title.length}/160</span></div>
              </div>

              {/* Description */}
              <div className="mb-5">
                <label className="block text-[13px] font-semibold mb-1.5">
                  菜谱描述 <span style={{ color: "var(--brand)" }}>*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  maxLength={1200}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="简单描述这道菜的特色、灵感来源、适合什么场景…"
                  className="fp-textarea"
                />
                <div className="mt-1 text-right text-xs text-[var(--muted)]">{form.description.length}/1200</div>
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
            <div className="mb-5 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-7">
              <h2 className="text-[15px] font-bold mb-5 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
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
                      className="rounded-md px-4 py-2 text-[13px] font-medium transition-colors duration-150"
                      style={{
                        border: `1.5px solid ${form.cook_time_minutes === min ? "var(--brand)" : "var(--separator)"}`,
                        background: form.cook_time_minutes === min ? "var(--brand-soft)" : "var(--surface)",
                        color: form.cook_time_minutes === min ? "var(--brand)" : "var(--muted)",
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
                        border: `1.5px solid ${difficulty === d.key ? "var(--brand)" : "var(--separator)"}`,
                        background: difficulty === d.key ? "var(--brand-soft)" : "var(--surface)",
                      }}
                    >
                      <span className="text-[13px] font-semibold" style={{ color: difficulty === d.key ? "var(--brand)" : "var(--muted, var(--muted))" }}>
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
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>逐一输入食材名称，按回车分隔</div>
              </div>

              {/* Equipment */}
              <div className="mb-5">
                <label className="block text-[13px] font-semibold mb-1.5">厨具</label>
                <TagInput tags={form.equipment} onChange={(t) => update("equipment", t)} placeholder="输入厨具后按回车添加" />
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>例如：炒锅、烤箱、空气炸锅</div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-[13px] font-semibold mb-1.5">标签</label>
                <TagInput tags={form.tags} onChange={(t) => update("tags", t)} placeholder="输入标签后按回车添加" />
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>例如：家常菜、快手菜、减脂、早餐</div>
              </div>
            </div>

            {/* Section 3: Cooking Steps */}
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-7">
              <h2 className="text-[15px] font-bold mb-5 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
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
                <div className="mb-4 p-3 rounded-lg text-[13px]" style={{ border: "1px solid var(--danger)", background: "var(--danger-soft)", color: "var(--danger)" }}>
                  {mutation.error?.message || extractMutation.error?.message || t("failed")}
                </div>
              ) : null}

              <button type="submit" disabled={isPending} className="fp-btn-publish">
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {isEditing ? t("save") : t("submit")}
              </button>

              <button
                type="button"
                onClick={() => {
                  const data = JSON.stringify(buildInput(form, difficulty));
                  const savedAt = new Date().toISOString();
                  localStorage.setItem("forkfit.draft", data);
                  localStorage.setItem("forkfit.draft.saved_at", savedAt);
                  setDraftSavedAt(savedAt);
                  setDraftSaved(true);
                  setTimeout(() => setDraftSaved(false), 2000);
                }}
                className="fp-btn-draft"
              >
                {draftSaved ? "✓ 已保存" : "存为草稿"}
              </button>
              {draftSavedAt && (
                <div className="mt-2 text-[12px]" style={{ color: "var(--muted)" }}>
                  草稿保存于 {formatDraftTime(draftSavedAt)}
                </div>
              )}

              {isEditing && (
                <button type="button" disabled={isPending} onClick={submitAndExtract} className="fp-btn-draft" style={{ marginTop: "8px" }}>
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
                  "图片清楚，食材写明用量",
                  "步骤写到别人能照做",
                  "标签和小贴士按需补充",
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
      tags: allTags,
      notes: form.notes.trim(),
      steps,
      difficulty,
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
    tags: post.recipe.tags.filter((t) => !["easy", "medium", "hard"].includes(t)),
    notes: post.recipe.notes,
    steps: post.recipe.steps?.length ? [...post.recipe.steps] : ["", "", ""],
  };
}
