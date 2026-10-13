import type { Metadata } from "next";
import { PackagingSection, BenefitsSection } from "@/components/Store";
import PageHero from "@/components/PageHero";
import { pageMeta } from "@/lib/seo";

// SEO: متادیتای کامل (توضیح + canonical + OG) برای صفحهٔ بسته‌بندی.
export const metadata: Metadata = pageMeta({
  path: "/packaging",
  title: "بسته‌بندی لوکس عطر و جعبهٔ هدیه | بلا پرفیوم",
  description:
    "آشنایی با بسته‌بندی سلطنتی بلا پرفیوم — پاکت مخملی، دوخت طلایی و جعبهٔ هدیه؛ همراه با خواص و راهنمای نگه‌داری عطر.",
});

export default function PackagingPage() {
  return (
    <>
      <PageHero
        eyebrow="LUXURY PRESENTATION"
        title="بسته‌بندی سلطنتی بلا"
        sub="از لحظه‌ی سفارش تا گشودن پاکت مخملی، همه‌چیز یک مراسم است."
      />
      <PackagingSection heading={false} />
      <BenefitsSection />
    </>
  );
}
