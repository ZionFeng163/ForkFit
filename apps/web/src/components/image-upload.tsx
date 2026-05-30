"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";

type Props = {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
};

export function ImageUpload({ images, onChange, maxImages = 8 }: Props) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
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
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) upload(file);
  }

  function removeImage(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {/* Preview grid */}
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-md border border-[#e4ded6]">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Upload zone */}
      {images.length < maxImages ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[#d8d0c6] transition-colors hover:border-[#7b6f61] hover:bg-[#faf8f5]"
        >
          {uploading ? (
            <Loader2 size={20} className="animate-spin text-[#9f9890]" />
          ) : (
            <div className="flex items-center gap-2 text-sm text-[#9f9890]">
              <Upload size={16} />
              <span>Drop image or click to upload</span>
            </div>
          )}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
