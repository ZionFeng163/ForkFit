"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 relative"
        style={{ background: "var(--lp-surface)", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 rounded-lg transition-colors"
          style={{ color: "var(--lp-muted)" }}
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0"
            style={{
              background: danger ? "#fef0ef" : "var(--lp-accent-light)",
              color: danger ? "#e0524a" : "var(--lp-accent)",
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "var(--lp-fg)" }}>{title}</h3>
            <p className="text-[13px] mt-1 leading-[1.6]" style={{ color: "var(--lp-muted)" }}>{message}</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
            style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all duration-150"
            style={{ background: danger ? "#e0524a" : "var(--lp-accent)" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
