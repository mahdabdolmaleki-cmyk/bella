import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import TutorialList from "@/components/TutorialList";

export const metadata: Metadata = {
  title: "آموزش | بلّا پرفیوم",
  description:
    "آکادمی بلّا — آموزش انتخاب، نگهداری و استفادهٔ درست از عطر.",
};

export default function LearnPage() {
  return (
    <>
      <PageHero
        eyebrow="BELLA ACADEMY"
        title="آکادمی بلّا"
        sub="هر آنچه دربارهٔ عطر باید بدانید — از شناخت رایحه تا نگهداری درست شیشه"
      />
      <TutorialList />
    </>
  );
}
