import { HeroSection } from "@/components/hero-section";
import { FeaturesSection } from "@/components/features-section";
import { HowItWorksSection } from "@/components/how-it-works-section";
import { CTASection } from "@/components/cta-section";
import { LandingNav } from "@/components/landing-nav";

export default async function Home() {
  return (
    <div className="min-h-screen bg-white">
      <LandingNav />
      <main>
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <CTASection />
      </main>
      <footer className="border-t border-[#e4ded6] bg-[#faf8f5] py-8 text-center text-sm text-[#9f9890]">
        <p>© 2026 吃什么 · ForkFit</p>
      </footer>
    </div>
  );
}
