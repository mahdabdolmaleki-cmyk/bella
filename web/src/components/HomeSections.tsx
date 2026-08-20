"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Plus, Star, Clock, Wind } from "lucide-react";
import { ProductVisual } from "./art";
import { Reveal, SectionHeading } from "./ui";
import { useCart } from "./Cart";
import { formatToman, toFa, type ProductDTO } from "@/lib/data";
import { parseBrands, type BrandCard } from "@/lib/settings";
import { parseFeatures } from "@/lib/icons";
import SiteIcon from "./SiteIcon";

/* ================= BRANDS ================= */
/** Shipped brand cards. The admin panel edits a copy of this list. */
export const DEFAULT_BRANDS: BrandCard[] = [
  { en: "Chanel", fa: "شنل", country: "فرانسه", year: "۱۹۱۰", d: "پیشگام عطرسازی مدرن؛ ظرافت پاریسی با نت‌های آلدئیدی." },
  { en: "Dior", fa: "دیور", country: "فرانسه", year: "۱۹۴۶", d: "شکوه گل‌محور و کوتور؛ رایحه‌هایی برای مجالس رسمی." },
  { en: "Tom Ford", fa: "تام فورد", country: "آمریکا", year: "۲۰۰۵", d: "جسور، اورینتال و اغواگر؛ استاندارد لوکس معاصر." },
  { en: "Creed", fa: "کرید", country: "انگلستان", year: "۱۷۶۰", d: "عطرساز خاندان‌های سلطنتی با ترکیب‌های دست‌ساز." },
  { en: "Amouage", fa: "آمواژ", country: "عمان", year: "۱۹۸۳", d: "کندر و عود عمانی در غلیظ‌ترین شکل ممکن." },
  { en: "Guerlain", fa: "گرلن", country: "فرانسه", year: "۱۸۲۸", d: "میراث وانیل و تونکا؛ امضای گورلیناد افسانه‌ای." },
  { en: "Byredo", fa: "بایردو", country: "سوئد", year: "۲۰۰۶", d: "مینیمال اسکاندیناوی با رایحه‌های مفهومی." },
  { en: "Xerjoff", fa: "زرجف", country: "ایتالیا", year: "۲۰۰۳", d: "هنر ایتالیایی و اسانس‌های نادر کلکسیونی." },
];

export function BrandsSection({
  brands = "",
  icon,
}: {
  brands?: string;
  /** Icon file name chosen in «تنطیمات سایت». */
  icon?: string;
}) {
  // Admin-managed cards, with the built-in list as a safety net.
  const cards = parseBrands(brands, DEFAULT_BRANDS);

  return (
    <section className="relative py-16 sm:py-24" id="brands">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-3 flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/35 bg-gold/10">
            <SiteIcon name={icon} fallback="crown" size={24} />
          </span>
        </div>
        <SectionHeading
          eyebrow="MAISONS DU MONDE"
          title="برندهای مطرح دنیا در بلا"
          sub="الهام‌بخش‌های ما و خانه‌هایی که تاریخ عطرسازی را نوشتند."
        />

        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {cards.map((b, i) => (
            <Reveal key={`${b.en}-${i}`} delay={(i % 4) * 0.07}>
              <div className="glass-card group h-full rounded-2xl p-4 transition-all duration-500 hover:-translate-y-1.5 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-lg leading-none font-bold tracking-wider text-gold-soft sm:text-xl">
                    {b.en}
                  </span>
                  {b.year && (
                    <span className="rounded-full border border-gold/25 px-2 py-0.5 text-[9px] text-gold/70">
                      {b.year}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[12px] font-black text-cream sm:text-sm">{b.fa}</p>
                <p className="mt-0.5 text-[10px] text-gold/60">{b.country}</p>
                <div className="hairline my-2.5 h-px w-full opacity-60" />
                <p className="text-[10.5px] leading-[1.8] text-sage sm:text-[11.5px]">{b.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= BESTSELLERS ================= */
export function BestsellersSection({ icon }: { icon?: string }) {
  const [rows, setRows] = useState<ProductDTO[] | null>(null);
  const { add } = useCart();

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setRows(d.products ?? []))
      .catch(() => setRows([]));
  }, []);

  const top = (rows ?? [])
    .slice()
    .sort((a, b) => Number(b.bestseller) - Number(a.bestseller) || b.price - a.price)
    .slice(0, 4);

  return (
    <section className="relative py-16 sm:py-24" id="best">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-forest/30 to-transparent" />
      <div className="relative mx-auto max-w-5xl px-5">
        <div className="mb-3 flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/35 bg-gold/10">
            <SiteIcon name={icon} fallback="medal" size={24} />
          </span>
        </div>
        <SectionHeading
          eyebrow="BEST SELLERS"
          title="پرفروش‌ترین عطرهای بلا"
          sub="انتخاب مشتریان ما در سه ماه گذشته."
        />

        {!rows ? (
          <div className="mt-10 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl glass-panel" />
            ))}
          </div>
        ) : (
          <div className="mt-10 space-y-3">
            {top.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.6, delay: i * 0.08 }}
                className="group flex items-center gap-3 rounded-2xl glass-panel p-3 transition-all duration-500 hover:border-gold/45 sm:gap-5 sm:p-4"
              >
                <span className="font-display w-6 shrink-0 text-center text-2xl font-bold text-gold/30 sm:text-3xl">
                  {toFa(i + 1)}
                </span>

                <Link
                  href={`/shop/${p.id}`}
                  className="relative flex h-20 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-pine/35 to-night sm:h-24 sm:w-16"
                >
                  <div className="absolute h-12 w-12 rounded-full bg-gold/10 blur-xl transition-all group-hover:bg-gold/25" />
                  <ProductVisual
                    image={p.image}
                    glass={p.glass}
                    liquid={p.liquid}
                    alt={p.name}
                    className="relative w-9 transition-transform duration-500 group-hover:scale-110 sm:w-11"
                  />
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/shop/${p.id}`} className="truncate text-sm font-black text-cream transition-colors hover:text-gold sm:text-base">
                      {p.name}
                    </Link>
                    {p.bestseller && (
                      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-bold text-gold sm:flex">
                        <Star size={9} fill="currentColor" /> منتخب
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-sage">{p.tagline}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] text-sage/80">
                    <span className="flex items-center gap-1">
                      <Clock size={10} className="text-gold" /> {p.longevity}
                    </span>
                    <span className="hidden items-center gap-1 sm:flex">
                      <Wind size={10} className="text-gold" /> {p.sillage}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-[11px] font-black text-gold-soft sm:text-sm">
                    {formatToman(p.price)}
                  </span>
                  <button
                    onClick={() =>
                      add({ id: p.id, name: p.name, price: p.price, glass: p.glass, liquid: p.liquid, sizeMl: p.sizeMl })
                    }
                    className="flex items-center gap-1 rounded-full bg-gold px-3 py-1.5 text-[10px] font-black text-[#241a05] active:scale-90 sm:text-[11px]"
                  >
                    <Plus size={12} /> افزودن
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <Reveal delay={0.15} className="mt-10 text-center">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 rounded-full border border-gold/40 px-7 py-3 text-[13px] font-bold text-gold-soft transition-colors hover:bg-gold/10"
          >
            مشاهده کل کلکسیون
            <ArrowLeft size={15} />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ================= FEATURE STRIP (مزیت‌های فروشگاه) ================= */
/**
 * Four short trust cards, each with a self-hosted icon from `public/icons`.
 * Both the icons and the text are editable from «تنطیمات سایت».
 */
export function FeaturesSection({ features = "", icon }: { features?: string; icon?: string }) {
  const cards = parseFeatures(features);

  return (
    <section className="relative py-12 sm:py-16" id="features">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold/35 bg-gold/10">
            <SiteIcon name={icon} fallback="shield-check" size={18} />
          </span>
          <h2 className="text-sm font-black text-cream sm:text-base">چرا بلا؟</h2>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {cards.map((c, i) => (
            <Reveal key={`${c.title}-${i}`} delay={(i % 4) * 0.07}>
              <div className="glass-card group h-full rounded-2xl p-4 text-center transition-all duration-500 hover:-translate-y-1.5 sm:p-5">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/35 bg-gold/10 transition-transform duration-500 group-hover:scale-110">
                  <SiteIcon name={c.icon} size={24} />
                </span>
                <p className="mt-3 text-[12.5px] font-black text-cream sm:text-sm">{c.title}</p>
                <p className="mt-1.5 text-[10.5px] leading-[1.9] text-sage sm:text-[11.5px]">{c.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
