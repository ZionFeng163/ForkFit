"use client";

import { ChefHat, Search, Sparkles, Clock, Leaf } from "lucide-react";

export function MockupSection() {
  return (
    <section className="bg-gradient-to-b from-[#f5f0ea] to-white py-8 sm:py-12">
      <div className="mx-auto max-w-3xl px-6">
        {/* Mockup card */}
        <div className="overflow-hidden rounded-2xl border border-[#e8dfd6] bg-white shadow-lg shadow-[#e8dfd6]/50">
          {/* Mockup header */}
          <div className="flex items-center justify-between border-b border-[#f0ebe4] px-6 py-4">
            <div className="flex items-center gap-2">
              <img src="/logo_zh.png" alt="吃什么" className="h-6 w-auto" />
              <span className="text-sm font-semibold text-[#3a332c]">蒜蓉西兰花</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#f0e8dc] px-3 py-1 text-xs text-[#8b7355]">已定制</span>
            </div>
          </div>

          {/* Mockup body — split layout */}
          <div className="grid sm:grid-cols-2">
            {/* Left: ingredients */}
            <div className="border-r border-[#f0ebe4] p-6">
              <p className="text-xs font-medium text-[#b8946e]">食材清单</p>
              <div className="mt-3 space-y-2">
                {["西兰花", "蒜", "盐", "蚝油"].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8b7355]"></span>
                    <span className="text-sm text-[#5a4a3a]">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: steps */}
            <div className="p-6">
              <p className="text-xs font-medium text-[#b8946e]">烹饪步骤</p>
              <div className="mt-3 space-y-3">
                {["焯水去腥", "热锅爆香", "翻炒出锅"].map((step, i) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#faf6f0] text-[10px] font-bold text-[#8b7355]">{i + 1}</span>
                    <div className="h-2 flex-1 rounded-full bg-[#f0ebe4]">
                      <div className="h-full rounded-full bg-[#d4cfc8]" style={{ width: `${100 - i * 20}%` }}></div>
                    </div>
                    <span className="text-xs text-[#8b7355]">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mockup footer — tags */}
          <div className="border-t border-[#f0ebe4] px-6 py-3">
            <div className="flex flex-wrap gap-2">
              {["素菜", "快手菜", "5分钟"].map((tag) => (
                <span key={tag} className="rounded-full bg-[#faf6f0] px-2.5 py-0.5 text-[10px] text-[#8b7355]">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
