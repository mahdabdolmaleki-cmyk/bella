import type { MetadataRoute } from "next";

/**
 * مانیفست PWA — شناسنامهٔ اپ برای نصب روی گوشی و ساخت اپ اندروید (PWABuilder / TWA).
 * Next.js آن را در /manifest.webmanifest سرو می‌کند و لینکش را خودکار در <head> می‌گذارد،
 * پس به layout.tsx دست نمی‌خورد.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "بلا پرفیوم | مزون عطرهای لوکس",
    short_name: "بلا پرفیوم",
    description:
      "فروشگاه آنلاین عطرهای لوکس بلا پرفیوم — کلکسیون عطرهای اورینتال با بسته‌بندی مخملی و دوخت طلایی.",
    lang: "fa",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#06120b",
    theme_color: "#06120b",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/pwa/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "فروشگاه",
        url: "/shop",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "حساب کاربری و سفارش‌ها",
        short_name: "حساب من",
        url: "/account",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "آموزش‌ها",
        url: "/learn",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
