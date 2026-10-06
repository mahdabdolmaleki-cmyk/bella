import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import { getSiteSettings, DEFAULT_SETTINGS } from "@/lib/settings";

export const metadata: Metadata = {
  title: "قوانین و مقررات | بلا پرفیوم",
  description:
    "قوانین و مقررات خرید از فروشگاه عطر بلا پرفیوم — اصالت کالا، ارسال، بازگشت و حریم خصوصی.",
};

export const revalidate = 60;

/**
 * صفحهٔ قوانین و مقررات.
 *
 * عنوان و متن این صفحه از تنظیمات سایت خوانده می‌شود و ادمین آن را از
 * «پنل مدیریت ← تنظیمات ← قوانین و مقررات» ویرایش می‌کند. هر خط از متن
 * یک پاراگراف مستقل رندر می‌شود؛ خطی که با «##» شروع شود به‌عنوان تیتر
 * بخش نمایش داده می‌شود.
 */
export default async function TermsPage() {
  const settings = await getSiteSettings();

  const title = settings.termsTitle?.trim() || DEFAULT_SETTINGS.termsTitle;
  const rawText = settings.termsText?.trim() || DEFAULT_SETTINGS.termsText;

  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <main>
      <PageHero
        eyebrow="BELLA PERFUME"
        title={title}
        sub="شرایط استفاده از فروشگاه، سیاست ارسال و بازگشت کالا و حریم خصوصی مشتریان."
      />

      <section className="mx-auto max-w-3xl px-5 pb-24">
        <div className="rounded-3xl glass-panel p-6 text-right sm:p-8">
          {lines.map((line, i) =>
            line.startsWith("## ") ? (
              <h2
                key={i}
                className="mt-7 flex items-center gap-2 text-base font-black text-gold-soft first:mt-0"
              >
                <span className="inline-block h-1.5 w-1.5 rotate-45 bg-gold" />
                {line.slice(3)}
              </h2>
            ) : (
              <p
                key={i}
                className="mt-4 text-[13.5px] leading-9 text-cream/85 first:mt-0"
              >
                {line}
              </p>
            ),
          )}
        </div>

        <p className="mt-6 text-center text-[11px] leading-6 text-sage">
          در صورت داشتن هرگونه پرسش دربارهٔ این قوانین، از طریق صفحهٔ{" "}
          <a href="/contact" className="font-bold text-gold-soft hover:text-gold">
            تماس با ما
          </a>{" "}
          با ما در ارتباط باشید.
        </p>
      </section>
    </main>
  );
}
