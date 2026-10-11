import type { Metadata } from "next";
import { ProductsSection } from "@/components/Store";
import PageHero from "@/components/PageHero";

export const metadata: Metadata = { title: "فروشگاه | بلا پرفیوم" };

export default function ShopPage() {
  // دسته‌بندی‌ها اکنون درختی‌اند و از `/api/categories` خوانده می‌شوند؛
  // ادمین آن‌ها را در پنل «دسته‌بندی‌ها» می‌سازد و مدیریت می‌کند.
  return (
    <>
      <PageHero
        eyebrow="THE COLLECTION"
        title="فروشگاه بلا"
        sub="کلکسیون کامل عطرهای اورینتال و فرانسوی مزون بلا"
      />
      <ProductsSection heading={false} />
    </>
  );
}
