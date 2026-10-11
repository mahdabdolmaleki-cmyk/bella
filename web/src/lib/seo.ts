// ابزارهای مشترک سئو (v43): آدرس پایهٔ سایت و ساخت URL مطلق.
// در سرور از NEXT_PUBLIC_SITE_URL و در نبود آن از دامنهٔ تولید استفاده می‌شود.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://bellaperfume.ir";

/** تبدیل مسیر نسبی به URL مطلق (برای canonical/OG/sitemap). */
export function abs(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p === "/" ? "/" : p}`;
}

/** متادیتای استاندارد یک صفحه (canonical + OG پایه) تا تکرار نشود. */
export function pageMeta(opts: {
  path: string;
  title: string;
  description: string;
  image?: string;
}) {
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: abs(opts.path) },
    openGraph: {
      url: abs(opts.path),
      title: opts.title,
      description: opts.description,
      locale: "fa_IR",
      siteName: "بلا پرفیوم",
      type: "website",
      ...(opts.image ? { images: [abs(opts.image)] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
    },
  };
}
