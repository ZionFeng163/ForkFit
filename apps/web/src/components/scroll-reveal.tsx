"use client";

import { ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function ScrollReveal({ children, className = "", delay = 0 }: ScrollRevealProps) {
  // Use CSS animation with delay instead of JS IntersectionObserver
  // This works even if client JS hydration is delayed
  const style = {
    animation: `fadeInUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
  };

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
