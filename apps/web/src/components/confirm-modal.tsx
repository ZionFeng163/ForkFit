"use client";

import { useEffect, useId, useRef } from "react";
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
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleEsc);
    cancelButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleEsc);
      previouslyFocused?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center"
      style={{ background: "rgba(0,0,0,0.46)" }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-sm rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_2px_8px_rgba(0,0,0,.14)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="关闭"
          className="absolute top-4 right-4 p-1 rounded-lg transition-colors"
          style={{ color: "var(--muted)" }}
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg"
            style={{
              background: danger ? "var(--danger-soft)" : "var(--brand-soft)",
              color: danger ? "var(--danger)" : "var(--brand)",
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 id={titleId} className="text-base font-bold" style={{ color: "var(--text)" }}>{title}</h3>
            <p id={descriptionId} className="text-[13px] mt-1 leading-[1.6]" style={{ color: "var(--muted)" }}>{message}</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="button-secondary h-9 min-h-9"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
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
