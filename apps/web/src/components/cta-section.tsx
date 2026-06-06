"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "@/i18n/routing";

export function CTASection() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="bg-gradient-to-br from-[#2f2a24] to-[#5f5a52] py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div
          className={`text-center transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            准备好了吗？
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#d8d0c6]">
            浏览社区菜谱，一键定制属于你的专属口味
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#2f2a24] shadow-lg transition-all duration-300 hover:bg-[#faf8f5] hover:shadow-xl hover:-translate-y-0.5"
            >
              <Sparkles size={16} />
              浏览菜谱
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/10 hover:-translate-y-0.5"
            >
              设置口味偏好
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
