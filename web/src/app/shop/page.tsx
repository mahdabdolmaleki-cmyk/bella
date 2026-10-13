import type { Metadata } from "next";
import { ProductsSection } from "@/components/Store";
import PageHero from "@/components/PageHero";
import { pageMeta } from "@/lib/seo";
import { getSSRProducts } from "@/lib/serverData";

// SEO: عنوان/توضیح/canonical/OG کامل برای صفحهٔ فروشگاه (قبلاً فقط عنوان بود).
export const metadata: Metadata = pageMeta({
  path: "/shop",
  title: "فروشگاه عطر بلا | خرید ادکلن اورجینال و اسانس عطر",
  description:
    "کلکسیون کامل عطرهای اورینتال و فرانسوی مزون بلا — خرید آنلاین با ضمانت اصالت، بسته‌بندی لوکس و ارسال سریع.",
});

// SSR (v45): اولین صفحهٔ کاتالوگ سمت سرور واکشی و داخل HTML رندر می‌شود.
export default async function ShopPage() {
  const initialProducts = await getSSRProducts();
  // دسته‌بندی‌ها اکنون درختی‌اند و از `/api/categories` خوانده می‌شوند؛
  // ادمین آن‌ها را در پنل «دسته‌بندی‌ها» می‌سازد و مدیریت می‌کند.
  return (
    <>
      <PageHero
        eyebrow="THE COLLECTION"
        title="فروشگاه بلا"
        sub="کلکسیون کامل عطرهای اورینتال و فرانسوی مزون بلا"
      />
      <ProductsSection heading={false} initialProducts={initialProducts} />
    </>
  );
}
