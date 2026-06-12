"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

export function RemoteImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`${alt}（图片暂不可用）`}
        className={`flex items-center justify-center bg-[#eeeae2] text-[#9a9388] ${className ?? ""}`}
      >
        <ImageOff aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
