"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { useAuth } from "@/components/auth-provider";

type Props = {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
};

export function ImageUpload({ images, onChange, maxImages = 8 }: Props) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/backend/upload/image", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("forkfit.auth.token") || ""}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      onChange([...images, url]);
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }, [images, onChange, user]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file) => {
        if (file.type.startsWith("image/")) upload(file);
      });
    }
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragover(false);
    const files = e.dataTransfer.files;
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) upload(file);
    });
  }

  function removeImage(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  return (
    <div>
      {/* Preview grid */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mb-4">
          {images.map((url, i) => (
            <div
              key={i}
              className="group relative w-[100px] h-[100px] rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--lp-border)" }}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-[22px] h-[22px] rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.55)", color: "white" }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {images.length < maxImages && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl py-10 text-center cursor-pointer transition-all duration-200"
          style={{
            border: `2px dashed ${dragover ? "var(--lp-accent)" : "var(--lp-border)"}`,
            background: dragover ? "var(--lp-accent-light)" : "var(--lp-warm-100)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.background = "var(--lp-accent-light)"; }}
          onMouseLeave={(e) => { if (!dragover) { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.background = "var(--lp-warm-100)"; } }}
        >
          {uploading ? (
            <Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--lp-muted)" }} />
          ) : (
            <>
              <div
                className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-3"
                style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}
              >
                <ImagePlus size={22} />
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                点击或拖拽上传图片
              </div>
              <div className="text-xs" style={{ color: "var(--lp-muted)" }}>
                支持 JPG、PNG，最多 {maxImages} 张
              </div>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
