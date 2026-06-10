"use client";

import { ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function ScrollReveal({ children, className = "", delay = 0 }: ScrollRevealProps) {
  return (
    <div
      className={className}
      style={{
        animation: `fadeSlideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
      }}
    >
      {children}
    </div>
  );
}
