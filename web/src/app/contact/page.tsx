import type { Metadata } from "next";
import { ContactSection } from "@/components/Chrome";
import PageHero from "@/components/PageHero";
import { getSiteSettings } from "@/lib/settings";
import { parseSocials } from "@/lib/socials";
import { pageMeta } from "@/lib/seo";

// SEO: متادیتای کامل صفحهٔ تماس.
export const metadata: Metadata = pageMeta({
  path: "/contact",
  title: "تماس با بلا پرفیوم | پشتیبانی و مشاورهٔ خرید عطر",
  description:
    "راه‌های ارتباط با مزون بلا پرفیوم — پشتیبانی خرید، مشاورهٔ انتخاب عطر و پیگیری سفارش از طریق پیام‌رسان‌ها و راه‌های تماس.",
});

// محتوای این صفحه از تنظیمات می‌آید، پس باید سروری رندر شود.
// getSiteSettings خودش ۶۰ ثانیه کش دارد.
export default async function ContactPage() {
  const settings = await getSiteSettings();
  const socials = parseSocials(settings.contactSocials);

  return (
    <>
      <PageHero
        eyebrow="CONTACT"
        title="تماس با مزون بلا"
        sub="مشاوران رایحه‌ی ما آماده‌اند عطر اختصاصی شما را پیدا کنند."
      />
      <ContactSection
        heading={false}
        intro={settings.contactSocialIntro}
        socials={socials}
        phone={settings.contactPhone}
        email={settings.contactEmail}
        address={settings.contactAddress}
        hours={settings.contactHours}
      />
    </>
  );
}
