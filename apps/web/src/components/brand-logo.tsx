import { useLocale } from "next-intl";

import { Link } from "@/i18n/routing";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
  linked?: boolean;
};

export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
    >
      <path d="M12 34h40c-1.7 12.1-9 19-20 19s-18.3-6.9-20-19Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
      <path d="M32 34V10M32 23 21 12M32 23l11-11" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 57h18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLogo({ compact = false, className = "", linked = true }: BrandLogoProps) {
  const locale = useLocale();
  const content = (
    <span className={`brand-logo ${className}`} aria-label={locale === "zh" ? "吃什么 · ForkFit" : "ForkFit"}>
      <BrandMark className="h-9 w-9 shrink-0" />
      {!compact && (
        <span className="brand-wordmark">
          <strong>{locale === "zh" ? "吃什么" : "ForkFit"}</strong>
          {locale === "zh" && <span>ForkFit</span>}
        </span>
      )}
    </span>
  );

  return linked ? <Link href="/">{content}</Link> : content;
}
