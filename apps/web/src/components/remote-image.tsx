"use client";

import { CookingPot } from "lucide-react";
import { useState } from "react";

export function RemoteImage({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`${alt}（图片暂不可用）`}
        className={`flex items-center justify-center bg-[radial-gradient(circle_at_35%_30%,var(--surface-container-lowest),var(--surface-container-high))] text-[var(--on-surface-variant)] ${className ?? ""}`}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] shadow-sm">
          <CookingPot aria-hidden="true" className="h-5 w-5 opacity-70" strokeWidth={1.6} />
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
