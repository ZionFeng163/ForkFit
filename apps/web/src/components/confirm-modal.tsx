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
      style={{ background: "rgba(32,28,24,0.46)" }}
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_2px_8px_rgba(32,28,24,.14)]"
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
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg"
            style={{
              background: danger ? "var(--danger-soft)" : "var(--lp-accent-light)",
              color: danger ? "var(--danger)" : "var(--lp-accent)",
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
            className="button-secondary h-9 min-h-9"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="button-primary h-9 min-h-9"
            style={{ background: danger ? "var(--danger)" : undefined, borderColor: danger ? "var(--danger)" : undefined }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
