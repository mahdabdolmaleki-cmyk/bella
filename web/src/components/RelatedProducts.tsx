"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { BasketIcon } from "./BasketIcon";
import { ProductVisual } from "./art";
import SiteIcon from "./SiteIcon";
import { useCart } from "./Cart";
import { formatToman, type ProductDTO } from "@/lib/data";
import { parseSectionIcons } from "@/lib/icons";

/**
 * «عطرهای مشابه» — shown on the product page right above the reviews.
 *
 * The ranking itself lives on the server (`GET /api/products/:id/related`) and
 * is based on shared notes, scent family, brand, category and a close price
 * bracket, so it works from day one without any purchase history.
 *
 * چیدمان: یک ردیف افقیِ اسکرول‌شونده با ۷ جایگاه — ۶ عطر مشابه و در جایگاه
 * هفتم کارتِ «ادکلن‌های بیشتر» که به صفحهٔ فروشگاه می‌برد.
 */
export default function RelatedProducts({
  productId,
  icon,
}: {
  productId: number;
  icon?: string;
}) {
  const [rows, setRows] = useState<ProductDTO[] | null>(null);
  // The product page is a client component, so when no icon is passed in we
  // read the admin choice straight from the public settings endpoint.
  const [sectionIcon, setSectionIcon] = useState<string | undefined>(icon);
  const { add } = useCart();
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (icon) {
      setSectionIcon(icon);
      return;
    }
    let alive = true;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setSectionIcon(parseSectionIcons(d.settings?.sectionIcons).related);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [icon]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetch(`/api/products/${productId}/related?limit=6`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => {
        if (alive) setRows(Array.isArray(d.products) ? d.products : []);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  // اسکرول نرم ردیف با فلش‌ها (فقط دسکتاپ؛ در موبایل با لمس اسکرول می‌شود).
  // در چیدمان RTL مقدار منفی یعنی حرکت به سمت چپ = آیتم‌های بعدی.
  const scrollByAmount = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };

  // Nothing to suggest (single-product catalogue) → render nothing at all.
  if (rows !== null && rows.length === 0) return null;

  const cardCls = "w-[46%] shrink-0 snap-start sm:w-44 lg:w-45";

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/35 bg-gold/10">
          <SiteIcon name={sectionIcon} fallback="sparkles" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-cream sm:text-base">عطرهای مشابه</h2>
          <p className="mt-0.5 text-[10.5px] text-sage">
            انتخاب‌هایی با نت‌ها و حس‌وحال نزدیک به این رایحه
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => scrollByAmount(1)}
            aria-label="عطرهای قبلی"
            className="hidden h-7 w-7 items-center justify-center rounded-full border border-gold/30 text-gold transition-colors hover:bg-gold/10 sm:flex"
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount(-1)}
            aria-label="عطرهای بعدی"
            className="hidden h-7 w-7 items-center justify-center rounded-full border border-gold/30 text-gold transition-colors hover:bg-gold/10 sm:flex"
          >
            <ChevronLeft size={14} />
          </button>
          <Link
            href="/shop"
            className="mr-1 flex items-center gap-1 text-[11px] font-bold text-gold hover:text-gold-soft"
          >
            همه عطرها <ArrowLeft size={12} />
          </Link>
        </div>
      </div>

      {rows === null ? (
        <div
          ref={trackRef}
          className="related-track mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={`${cardCls} h-56 animate-pulse rounded-2xl glass-panel`}
            />
          ))}
        </div>
      ) : (
        <div
          ref={trackRef}
          className="related-track mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
        >
          {rows.slice(0, 6).map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.07 }}
              className={`${cardCls} group flex flex-col rounded-2xl glass-panel p-3.5 transition-all duration-500 hover:-translate-y-1`}
            >
              <Link
                href={`/shop/${p.id}`}
                className="relative mx-auto flex h-28 w-20 items-center justify-center"
              >
                <div className="absolute h-14 w-14 rounded-full bg-gold/10 blur-xl transition-all group-hover:bg-gold/25" />
                <ProductVisual
                  image={p.image}
                  glass={p.glass}
                  liquid={p.liquid}
                  alt={p.name}
                  className="relative w-14 transition-transform duration-500 group-hover:scale-110"
                />
              </Link>

              <Link
                href={`/shop/${p.id}`}
                className="mt-2 truncate text-center text-[12.5px] font-black text-cream transition-colors hover:text-gold"
              >
                {p.name}
              </Link>
              <p className="mt-0.5 line-clamp-2 min-h-8 text-center text-[10px] leading-5 text-sage">
                {p.tagline}
              </p>
              <p className="mt-1 text-center text-[11.5px] font-black text-gold">
                {formatToman(p.price)}
              </p>

              <button
                type="button"
                onClick={() => add(p)}
                className="mt-2.5 flex items-center justify-center gap-1.5 rounded-full border border-gold/35 py-1.5 text-[10.5px] font-bold text-gold transition-colors hover:bg-gold/10"
              >
                <BasketIcon size={11} /> افزودن به سبد
              </button>
            </motion.div>
          ))}

          {/* جایگاه هفتم — ادکلن‌های بیشتر */}
          <Link
            href="/shop"
            className={`${cardCls} group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gold/35 bg-gold/[0.04] p-3.5 text-center transition-all duration-500 hover:-translate-y-1 hover:border-gold/60 hover:bg-gold/10`}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold transition-transform duration-500 group-hover:scale-110">
              <LayoutGrid size={24} />
            </span>
            <span>
              <span className="block text-[13px] font-black text-cream">
                ادکلن‌های بیشتر
              </span>
              <span className="mt-1 flex items-center justify-center gap-1 text-[10.5px] font-bold text-gold">
                مشاهدهٔ فروشگاه <ArrowLeft size={11} />
              </span>
            </span>
          </Link>
        </div>
      )}
    </section>
  );
}
