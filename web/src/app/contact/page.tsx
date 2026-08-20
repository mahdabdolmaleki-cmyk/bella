import type { Metadata } from "next";
import { ContactSection } from "@/components/Chrome";
import PageHero from "@/components/PageHero";
import { getSiteSettings } from "@/lib/settings";
import { parseSocials } from "@/lib/socials";

export const metadata: Metadata = { title: "تماس با ما | بلا پرفیوم" };

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
        address={settings.contactAddress}
        hours={settings.contactHours}
      />
    </>
  );
}
