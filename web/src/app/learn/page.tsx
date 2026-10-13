import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import TutorialList from "@/components/TutorialList";
import { getSSRTutorials } from "@/lib/serverData";

export const metadata: Metadata = {
  title: "آموزش | بلا پرفیوم",
  description:
    "آموزش انتخاب، نگهداری و استفادهٔ درست از عطر.",
};

// SSR (v45): فهرست آموزش‌ها سمت سرور رندر می‌شود.
export default async function LearnPage() {
  const { tutorials, categories } = await getSSRTutorials();
  return (
    <>
      <PageHero
        eyebrow="BELLA ACADEMY"
        title="آموزش"
        sub="هر آنچه دربارهٔ عطر باید بدانید — از شناخت رایحه تا نگهداری درست شیشه"
      />
      <TutorialList initialTutorials={tutorials} initialCategories={categories} />
    </>
  );
}
