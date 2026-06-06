import { AppShell } from "@/components/app-shell";
import { HeroSection } from "@/components/hero-section";
import { FeaturesSection } from "@/components/features-section";
import { HowItWorksSection } from "@/components/how-it-works-section";
import { CTASection } from "@/components/cta-section";

export default async function Home() {
  return (
    <AppShell>
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
    </AppShell>
  );
}
