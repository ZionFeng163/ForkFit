import { HeroSection } from "@/components/hero-section";
import { ProblemSection } from "@/components/problem-section";
import { HowItWorksSection } from "@/components/how-it-works-section";
import { FeaturesSection } from "@/components/features-section";
import { ShowcaseSection } from "@/components/showcase-section";
import { TestimonialsSection } from "@/components/testimonials-section";
import { CTASection } from "@/components/cta-section";
import { LandingNav } from "@/components/landing-nav";

export default async function Home() {
  return (
    <div className="min-h-screen" style={{ background: "var(--lp-bg)", color: "var(--lp-fg)" }}>
      <LandingNav />
      <main>
        <HeroSection />
        <ProblemSection />
        <HowItWorksSection />
        <FeaturesSection />
        <ShowcaseSection />
        <TestimonialsSection />
        <CTASection />
      </main>
      <footer
        className="py-12"
        style={{ borderTop: "1px solid var(--lp-border)" }}
      >
        <div className="mx-auto max-w-[1200px] px-6 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-[15px]" style={{ color: "var(--lp-fg)" }}>
            <div className="w-7 h-7 rounded-[7px] overflow-hidden flex-shrink-0">
              <img src="/logo_zh.png" alt="吃什么" className="w-full h-full object-cover" />
            </div>
            吃什么
          </div>
          <div className="flex gap-6">
            <a href="#" className="footer-link text-[13px] transition-colors" style={{ color: "var(--lp-muted)" }}>
              关于我们
            </a>
            <a href="#" className="footer-link text-[13px] transition-colors" style={{ color: "var(--lp-muted)" }}>
              使用条款
            </a>
            <a href="#" className="footer-link text-[13px] transition-colors" style={{ color: "var(--lp-muted)" }}>
              隐私政策
            </a>
            <a href="#" className="footer-link text-[13px] transition-colors" style={{ color: "var(--lp-muted)" }}>
              联系我们
            </a>
          </div>
          <div className="text-[13px]" style={{ color: "var(--lp-muted)" }}>
            © 2026 吃什么. 让每道菜都适合你。
          </div>
        </div>
      </footer>
    </div>
  );
}
