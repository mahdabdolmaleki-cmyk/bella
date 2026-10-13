import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Vazirmatn, Cormorant_Garamond, Alex_Brush } from "next/font/google";
import Shell from "@/components/Shell";
import { getSiteSettings } from "@/lib/settings";
import { SITE_URL, abs } from "@/lib/seo";
import "./globals.css";

// PERF: was `force-dynamic`, which disabled static rendering for the whole
// app. The settings fetch already revalidates every 60 seconds.
export const revalidate = 60;

const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],
  // PERF: 300 and 900 were downloaded on every visit but never used.
  weight: ["400", "500", "700"],
  variable: "--font-vazir",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

/* brand wordmark font — matches the "Bella Perfume" gold script supplied by the client */
const alexBrush = Alex_Brush({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-alexbrush",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // SEO: عنوان پیش‌فرض با کلیدواژه‌های اصلی خرید عطر.
    default: "بلا پرفیوم | خرید عطر اورجینال و ادکلن لوکس",
    template: "%s | بلا پرفیوم",
  },
  description:
    "بلا پرفیوم — افسونگری لوکس در قالب یک شیشه کریستال تراش‌خورده. کلکسیون عطرهای اورینتال با بسته‌بندی مخملی و دوخت طلایی.",
  other: { enamad: "2217815" },
  robots: { index: true, follow: true },
  alternates: { canonical: abs("/") },
  openGraph: {
    locale: "fa_IR",
    siteName: "بلا پرفیوم",
    type: "website",
    url: abs("/"),
    images: [abs("/crest.webp")],
  },
  twitter: {
    card: "summary_large_image",
    title: "بلا پرفیوم | خرید عطر اورجینال و ادکلن لوکس",
    description:
      "کلکسیون عطرهای اورینتال با بسته‌بندی مخملی و ضمانت اصالت.",
  },
};

// NEXT: themeColor باید در viewport باشد، نه metadata.
export const viewport: Viewport = { themeColor: "#0e3b26" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getSiteSettings();
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazir.variable} ${cormorant.variable} ${alexBrush.variable}`}
    >
      <body className="bg-night text-cream antialiased">
        <Shell
          footerAbout={settings.footerAbout}
          footerBadges={settings.footerBadges}
          footerGuaranteeTitle={settings.footerGuaranteeTitle}
          footerGuarantees={settings.footerGuarantees}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
