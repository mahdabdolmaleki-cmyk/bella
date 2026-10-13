import Link from "next/link";
import Journey from "@/components/Journey";
import {
  BrandsSection,
  BestsellersSection,
  FeaturesSection,
} from "@/components/HomeSections";
import BellaConsultation from "@/components/BellaConsultation";
import { DEFAULT_SETTINGS, getSiteSettings } from "@/lib/settings";
import { parseSectionIcons } from "@/lib/icons";
import { parseSocials } from "@/lib/socials";
import { SITE_URL, abs } from "@/lib/seo";
import { getSSRProducts } from "@/lib/serverData";

export const revalidate = 60;

// SEO: دادهٔ ساختاریافتهٔ برند + وب‌سایت برای گوگل (ریچ‌اسنیپت و دانش‌نما).
// sameAs از شبکه‌های اجتماعیِ ثبت‌شده در تنظیماتِ تماس پر می‌شود تا گوگل
// هویت برند را بین وب و شبکه‌ها یکپارچه بفهمد.
function homeLD(sameAs: string[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "بلا پرفیوم",
        url: SITE_URL,
        logo: abs("/logo.webp"),
        ...(sameAs.length ? { sameAs } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "بلا پرفیوم | مزون عطرهای لوکس",
        inLanguage: "fa",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

const HOME_INTRO_LINKS: Record<string, string> = {
  "آموزش‌های آکادمی بلا": "/learn",
  "فروشگاه عطر بلا": "/shop",
};

function renderHomeIntroBody(body: string) {
  return body
    .split(/(آموزش‌های آکادمی بلا|فروشگاه عطر بلا)/g)
    .map((part, index) => {
      const href = HOME_INTRO_LINKS[part];
      return href ? (
        <Link key={index} href={href} className="font-bold text-gold hover:underline">
          {part}
        </Link>
      ) : (
        part
      );
    });
}

export default async function HomePage() {
  const settings = await getSiteSettings();
  // Keep the SEO H1 present for older or accidentally-cleared settings.
  const homeIntroTitle = settings.homeIntroTitle.trim()
    ? settings.homeIntroTitle
    : DEFAULT_SETTINGS.homeIntroTitle;
  const homeIntroBody = settings.homeIntroBody;
  // Icons are self-hosted files in /public/icons, chosen from the admin panel.
  const icons = parseSectionIcons(settings.sectionIcons);
  // SSR: پرفروش‌ها سمت سرور واکشی می‌شوند تا بدون JS هم در HTML باشند.
  const bestsellers = await getSSRProducts();
  const sameAs = parseSocials(settings.contactSocials)
    .map((s) => s.href)
    .filter((h) => /^https?:\/\//.test(h));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeLD(sameAs)) }}
      />
      <Journey
          festivalActive={settings.festivalActive === "true"}
          festivalTitle={settings.festivalTitle}
          festivalSubtitle={settings.festivalSubtitle}
          festivalUntil={settings.festivalUntil}
        discountsActive={settings.discountsBoxActive === "1"}
        discountsTitle={settings.discountsBoxTitle}
        discountsSubtitle={settings.discountsBoxSubtitle}
        festivalIcon={icons.festival}
        discountsIcon={icons.discounts}
        journeyStages={settings.journeyStages}
        bottleGlass={settings.journeyBottleGlass}
        bottleLiquid={settings.journeyBottleLiquid}
        bottleImage={settings.journeyBottleImage}
      />
      <div id="after-journey" />
      {/* SEO: تنها H1 صفحهٔ اصلی + متن کلیدواژه‌دار و لینک‌سازی داخلی.
          قبلاً صفحهٔ اصلی H1 نداشت — مهم‌ترین سیگنالِ موضوعِ صفحه. */}
      <section className="mx-auto max-w-4xl px-5 pt-12 text-center sm:pt-16">
        <h1 className="text-lg font-black leading-9 text-cream sm:text-2xl sm:leading-10">
          {homeIntroTitle}
        </h1>
        {homeIntroBody.trim() ? (
          <p className="mt-3 whitespace-pre-line text-[12.5px] leading-7 text-sage sm:text-sm sm:leading-8">
            {renderHomeIntroBody(homeIntroBody)}
          </p>
        ) : null}
      </section>
      <FeaturesSection features={settings.homeFeatures} icon={icons.features} />
      <BrandsSection brands={settings.homeBrands} icon={icons.brands} />
      <BellaConsultation icon={icons.quiz} />
      <BestsellersSection icon={icons.best} initial={bestsellers} />
    </>
  );
}
