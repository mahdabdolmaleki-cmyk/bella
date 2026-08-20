import type { Metadata } from "next";
import { ProductsSection } from "@/components/Store";
import PageHero from "@/components/PageHero";
import { getSiteSettings, parseShopCategories } from "@/lib/settings";

export const metadata: Metadata = { title: "فروشگاه | بلا پرفیوم" };

export default async function ShopPage() {
  // دسته‌بندی‌ها از تنظیمات سایت می‌آیند تا ادمین بتواند بدون دست زدن
  // به کد آن‌ها را عوض کند.
  const settings = await getSiteSettings();
  const categories = parseShopCategories(settings.shopCategories);

  return (
    <>
      <PageHero
        eyebrow="THE COLLECTION"
        title="فروشگاه بلا"
        sub="کلکسیون کامل عطرهای اورینتال و فرانسوی مزون بلا"
      />
      <ProductsSection heading={false} categories={categories} />
    </>
  );
}
