"use client";

import { useEffect, useRef, useState } from "react";
import { Shield, Zap, Heart, Clock } from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "过敏安全",
    description: "自动检测并替换过敏源，确保每道菜都安全可食",
    color: "from-[#e8f5e9] to-[#c8e6c9]",
    iconColor: "text-[#2e7d32]",
  },
  {
    icon: Zap,
    title: "一键定制",
    description: "根据你的口味偏好，一键生成专属菜谱",
    color: "from-[#fff3e0] to-[#ffe0b2]",
    iconColor: "text-[#ef6c00]",
  },
  {
    icon: Heart,
    title: "口味记忆",
    description: "记住你的喜好，越用越懂你的口味",
    color: "from-[#fce4ec] to-[#f8bbd0]",
    iconColor: "text-[#c62828]",
  },
  {
    icon: Clock,
    title: "时间适配",
    description: "根据你的烹饪时间自动调整步骤复杂度",
    color: "from-[#e3f2fd] to-[#bbdefb]",
    iconColor: "text-[#1565c0]",
  },
];

function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
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
    <div
      ref={ref}
      className={`group relative overflow-hidden rounded-2xl border border-[#e4ded6] bg-white p-6 shadow-sm transition-all duration-500 hover:shadow-lg hover:-translate-y-1 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
      }`}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}></div>

      <div className="relative">
        {/* Icon */}
        <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} transition-transform duration-300 group-hover:scale-110`}>
          <feature.icon size={24} className={feature.iconColor} />
        </div>

        {/* Title */}
        <h3 className="mb-2 text-lg font-semibold text-[#2f2a24]">{feature.title}</h3>

        {/* Description */}
        <p className="text-sm leading-6 text-[#6f6a61]">{feature.description}</p>
      </div>
    </div>
  );
}

export function FeaturesSection() {
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
    <section ref={ref} className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section header */}
        <div
          className={`mb-16 text-center transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <h2 className="text-3xl font-bold text-[#2f2a24] sm:text-4xl">为什么选择吃什么</h2>
          <p className="mt-4 text-lg text-[#6f6a61]">智能适配，让每道菜都适合你</p>
        </div>

        {/* Features grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <FeatureCard key={i} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
