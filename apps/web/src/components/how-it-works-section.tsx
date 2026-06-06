"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, ChefHat, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: Search,
    number: "01",
    title: "选择菜谱",
    description: "浏览社区菜谱，找到你喜欢的菜品",
    color: "bg-[#e8f5e9]",
    iconColor: "text-[#2e7d32]",
  },
  {
    icon: Sparkles,
    number: "02",
    title: "一键定制",
    description: "系统根据你的口味偏好自动调整食材和步骤",
    color: "bg-[#fff3e0]",
    iconColor: "text-[#ef6c00]",
  },
  {
    icon: ChefHat,
    number: "03",
    title: "开始烹饪",
    description: "按照定制后的菜谱，享受专属美味",
    color: "bg-[#fce4ec]",
    iconColor: "text-[#c62828]",
  },
];

export function HowItWorksSection() {
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
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="bg-gradient-to-b from-white to-[#faf8f5] py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section header */}
        <div
          className={`mb-16 text-center transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <h2 className="text-3xl font-bold text-[#2f2a24] sm:text-4xl">三步搞定</h2>
          <p className="mt-4 text-lg text-[#6f6a61]">简单几步，就能享受个性化美食</p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connection line */}
          <div className="absolute left-1/2 top-0 hidden h-full w-0.5 -translate-x-1/2 bg-gradient-to-b from-[#e4ded6] via-[#d8d0c6] to-[#e4ded6] lg:block"></div>

          <div className="grid gap-12 lg:grid-cols-3">
            {steps.map((step, i) => (
              <div
                key={i}
                className={`relative transition-all duration-700 ${
                  isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
                }`}
                style={{ transitionDelay: `${i * 200 + 300}ms` }}
              >
                {/* Step card */}
                <div className="group relative overflow-hidden rounded-2xl border border-[#e4ded6] bg-white p-8 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                  {/* Number badge */}
                  <div className="absolute -right-4 -top-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#f5f0ea] to-[#e8dfd6] text-4xl font-bold text-[#d8d0c6] transition-transform duration-300 group-hover:scale-110">
                    {step.number}
                  </div>

                  {/* Icon */}
                  <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-xl ${step.color} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                    <step.icon size={28} className={step.iconColor} />
                  </div>

                  {/* Content */}
                  <h3 className="mb-3 text-xl font-semibold text-[#2f2a24]">{step.title}</h3>
                  <p className="text-sm leading-6 text-[#6f6a61]">{step.description}</p>

                  {/* Arrow for first two steps */}
                  {i < 2 && (
                    <div className="mt-6 flex items-center gap-2 text-xs font-medium text-[#9f9890]">
                      <span>下一步</span>
                      <ArrowRight size={14} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
