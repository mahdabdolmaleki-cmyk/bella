import type { Metadata } from "next";
import { PackagingSection, BenefitsSection } from "@/components/Store";
import PageHero from "@/components/PageHero";

export const metadata: Metadata = { title: "بسته‌بندی و خواص | بلا پرفیوم" };

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
