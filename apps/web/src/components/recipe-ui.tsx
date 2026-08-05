import { AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-heading">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function RecipeMeta({
  time,
  difficulty,
  servings,
  label,
}: {
  time?: number;
  difficulty?: string;
  servings?: string;
  label?: string;
}) {
  return (
    <div className="recipe-meta" aria-label="Recipe details">
      {time ? <span>{time} 分钟</span> : null}
      {difficulty ? <span>{difficulty}</span> : null}
      {servings ? <span>{servings}</span> : null}
      {label ? <span className="recipe-meta-emphasis">{label}</span> : null}
    </div>
  );
}

export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <Loader2 className="animate-spin" size={20} />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="state-panel state-panel-empty">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-panel state-panel-error" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {onRetry && <button type="button" className="button-secondary h-9 min-h-9" onClick={onRetry}>重试</button>}
    </div>
  );
}
