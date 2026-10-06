import Journey from "@/components/Journey";
import {
  BrandsSection,
  BestsellersSection,
  FeaturesSection,
} from "@/components/HomeSections";
import BellaConsultation from "@/components/BellaConsultation";
import { getSiteSettings } from "@/lib/settings";
import { parseSectionIcons } from "@/lib/icons";

export const revalidate = 60;

export default async function HomePage() {
  const settings = await getSiteSettings();
  // Icons are self-hosted files in /public/icons, chosen from the admin panel.
  const icons = parseSectionIcons(settings.sectionIcons);

  return (
    <>
      <Journey
        festivalActive={settings.festivalActive === "true"}
        festivalTitle={settings.festivalTitle}
        festivalSubtitle={settings.festivalSubtitle}
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
      <FeaturesSection features={settings.homeFeatures} icon={icons.features} />
      <BrandsSection brands={settings.homeBrands} icon={icons.brands} />
      <BellaConsultation icon={icons.quiz} />
      <BestsellersSection icon={icons.best} />
    </>
  );
}
