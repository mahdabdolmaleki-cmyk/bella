"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Droplets,
  Heart,
  Flame,
  Clock,
  Wind,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";
import { BasketIcon } from "@/components/BasketIcon";
import { ProductVisual } from "@/components/art";
import SiteIcon from "@/components/SiteIcon";
import { useCart } from "@/components/Cart";
import { useAuth } from "@/components/AuthContext";
import Reviews, { Stars } from "@/components/Reviews";
import RelatedProducts from "@/components/RelatedProducts";
import ClampLine from "@/components/ClampLine";
import { formatToman, toFa } from "@/lib/data";
import type { Product } from "@/lib/types";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "notfound" }
  | { kind: "ok"; product: Product };

type TabKey = "description" | "specs" | "reviews";

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tab, setTab] = useState<TabKey>("description");
  const [summary, setSummary] = useState<{
    average: number;
    count: number;
  } | null>(null);
  const { add } = useCart();

  const load = useCallback(
    (signal?: AbortSignal) => {
      setState({ kind: "loading" });
      fetch(`/api/products/${id}`, { signal })
        .then(async (res) => {
          if (res.status === 404) return setState({ kind: "notfound" });
          if (!res.ok) return setState({ kind: "error" });
          const data = await res.json();
          setState({ kind: "ok", product: data.product });
        })
        .catch((err) => {
          if ((err as { name?: string })?.name !== "AbortError")
            setState({ kind: "error" });
        });
    },
    [id],
  );

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setState({ kind: "notfound" });
      return;
    }
    const ctrl = new AbortController();
    load(ctrl.signal);

    fetch(`/api/reviews/${id}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSummary({ average: d.average, count: d.count }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [id, load]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sage">
        <Loader2 size={18} className="animate-spin" /> در حال بارگذاری…
      </div>
    );
  }

  if (state.kind === "notfound" || state.kind === "error") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-sage">
          {state.kind === "notfound"
            ? "این محصول پیدا نشد."
            : "خطا در دریافت محصول."}
        </p>
        <div className="flex gap-2">
          {state.kind === "error" && (
            <button
              onClick={() => load()}
              className="rounded-full border border-gold/40 px-5 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
            >
              تلاش مجدد
            </button>
          )}
          <Link
            href="/#shop"
            className="rounded-full border border-gold/40 px-5 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
          >
            بازگشت به فروشگاه
          </Link>
        </div>
      </div>
    );
  }

  const product = state.product;
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "description", label: "توضیحات" },
    { key: "specs", label: "ویژگی‌های محصول" },
    {
      key: "reviews",
      label: `نقد و بررسی‌ها${summary ? ` (${toFa(summary.count)})` : ""}`,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pt-24 pb-28 sm:px-6 md:pt-32">
      {/* breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[11px] text-sage">
        <Link href="/" className="hover:text-gold">
          خانه
        </Link>
        <ChevronLeft size={12} />
        <Link href="/#shop" className="hover:text-gold">
          فروشگاه
        </Link>
        <ChevronLeft size={12} />
        <span className="text-gold-soft">{product.name}</span>
      </nav>

      <div className="mt-5 grid grid-cols-1 gap-5 md:mt-6 md:grid-cols-2 md:gap-10">
        <Gallery product={product} />
        <Summary
          product={product}
          summary={summary}
          onAdd={() => add(product)}
        />
      </div>

      {/* عطرهای مشابه */}
      <RelatedProducts productId={product.id} />

      {/* tabs */}
      <div className="mt-12">
        <div className="flex gap-1 overflow-x-auto border-b border-gold/15 pb-px">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative shrink-0 px-4 py-3 text-[12.5px] font-bold whitespace-nowrap transition-colors sm:px-6 sm:text-sm ${
                tab === t.key ? "text-gold" : "text-sage hover:text-gold-soft"
              }`}
            >
              {t.label}
              {tab === t.key && (
                <motion.span
                  layoutId="product-tab"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="pt-6"
          >
            {tab === "description" && <DescriptionTab product={product} />}
            {tab === "specs" && <SpecsTab product={product} />}
            {tab === "reviews" && <Reviews productId={product.id} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* Gallery */

/**
 * گالری تصویر محصول: عکس اصلی + عکس‌های اضافهٔ گالری (تا ۱۰ عکس).
 *
 * تعامل‌ها:
 *  - دسکتاپ: ستون بندانگشتی عمودی کنار عکس + فلش‌های چپ/راست + کلیدهای جهت
 *  - موبایل: نوار بندانگشتی افقی زیر عکس + کشیدن انگشت (swipe) روی عکس
 * بندانگشتی فعال با اسکرول نوار، خودش هم به دید می‌آید.
 */
function Gallery({ product }: { product: Product }) {
  const images = [product.image, ...(product.gallery || [])].filter(
    (src): src is string => typeof src === "string" && src.length > 0,
  );
  const [active, setActive] = useState(0);
  const current = images[active];
  const count = images.length;

  const goTo = (index: number) => {
    if (count === 0) return;
    setActive(((index % count) + count) % count);
  };
  const prev = () => goTo(active - 1);
  const next = () => goTo(active + 1);

  // بندانگشتی فعال هنگام تعویض عکس (مثلا با فلش) به دید اسکرول می‌شود.
  useEffect(() => {
    const el = document.querySelector(`[data-thumb="${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);

  const thumb = (src: string, index: number) => (
    <button
      key={src}
      data-thumb={index}
      onClick={() => setActive(index)}
      aria-label={`تصویر ${toFa(index + 1)} از ${toFa(count)}`}
      aria-current={index === active}
      className={`relative h-16 w-14 shrink-0 overflow-hidden rounded-xl border transition-all duration-200 md:h-20 md:w-16 ${
        index === active
          ? "border-gold shadow-[0_0_0_2px_rgba(212,175,55,0.35)]"
          : "border-gold/20 opacity-70 hover:border-gold/50 hover:opacity-100"
      }`}
    >
      <Image
        src={src}
        alt={`${product.name} ${index + 1}`}
        fill
        sizes="64px"
        className="object-cover"
        unoptimized
      />
    </button>
  );

  return (
    <div className="min-w-0 md:flex md:flex-row md:items-start md:gap-3">
      <div className="min-w-0 flex-1">
        <div
          tabIndex={count > 1 ? 0 : -1}
          onKeyDown={(e) => {
            // در چیدمان RTL، حرکت به چپ یعنی عکس بعدی.
            if (e.key === "ArrowLeft") { e.preventDefault(); next(); }
            if (e.key === "ArrowRight") { e.preventDefault(); prev(); }
          }}
          className="product-gallery gold-ring relative flex aspect-square max-h-[58svh] items-center justify-center overflow-hidden rounded-3xl border border-gold/20 bg-gradient-to-b from-pine/25 to-night outline-none focus-visible:ring-2 focus-visible:ring-gold/50 md:aspect-4/5 md:max-h-none"
        >
          {current ? (
            <motion.div
              key={current}
              initial={{ opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 }}
              // کشیدن به چپ/راست روی موبایل عکس را عوض می‌کند؛ محور عمودی
              // آزاد است تا اسکرول عادی صفحه هم کار کند.
              drag={count > 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={(_e, info) => {
                if (info.offset.x < -60) next();
                else if (info.offset.x > 60) prev();
              }}
              className="relative h-full w-full cursor-grab active:cursor-grabbing"
            >
              <Image
                src={current}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 480px"
                className="object-contain p-4 md:p-6"
                priority
                unoptimized
              />
            </motion.div>
          ) : (
            <ProductVisual
              image={null}
              glass={product.glass}
              liquid={product.liquid}
              alt={product.name}
              className="h-4/5 w-4/5 md:h-[82%] md:w-[82%]"
            />
          )}

          {product.badge && (
            <span className="absolute top-4 right-4 tag-red rounded-full px-3 py-1 text-[10.5px] font-black">
              {product.badge}
            </span>
          )}

          {count > 1 && (
            <>
              {/* شمارندهٔ عکس */}
              <span className="absolute bottom-3 left-3 rounded-full bg-night/75 px-2.5 py-1 text-[10px] font-bold text-cream/90 backdrop-blur">
                {toFa(active + 1)} / {toFa(count)}
              </span>

              {/* فلش‌های تعویض عکس */}
              <button
                onClick={prev}
                aria-label="عکس قبلی"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-cream/70 transition-colors hover:text-gold"
              >
                <ChevronRight size={22} />
              </button>
              <button
                onClick={next}
                aria-label="عکس بعدی"
                className="absolute inset-y-0 left-0 flex w-10 items-center justify-center text-cream/70 transition-colors hover:text-gold"
              >
                <ChevronLeft size={22} />
              </button>
            </>
          )}
        </div>

        {/* موبایل: نوار بندانگشتی افقی زیر عکس */}
        {count > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {images.map((src, index) => thumb(src, index))}
          </div>
        )}
      </div>

      {/* دسکتاپ: ستون بندانگشتی عمودی کنار عکس */}
      {count > 1 && (
        <div className="mt-3 hidden max-h-[540px] flex-col gap-2 overflow-y-auto pl-1 md:mt-0 md:flex">
          {images.map((src, index) => thumb(src, index))}
        </div>
      )}
    </div>
  );
}

/* Product details */

function Summary({
  product,
  summary,
  onAdd,
}: {
  product: Product;
  summary: { average: number; count: number } | null;
  onAdd: () => void;
}) {
  const soldOut = product.inStock === false;

  return (
    <div>
      {/* فونت انگلیسی خوانا — قبلاً خط شکستهٔ Great Vibes بود */}
      {product.nameEn?.trim() && (
        <p dir="ltr" className="font-display text-right text-xl font-semibold text-gold-soft">
          {product.nameEn}
        </p>
      )}
      <h1 className="mt-1 font-display text-3xl font-black text-cream sm:text-4xl">
        {product.name}
      </h1>
      <p className="mt-2 text-sm leading-7 text-sage">{product.tagline}</p>

      {summary && summary.count > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <Stars value={summary.average} />
          <span className="text-[11.5px] text-sage">
            {toFa(summary.average.toFixed(1))} از ۵ — {toFa(summary.count)} نقد
          </span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-baseline gap-3">
        <span className="font-display text-2xl font-black text-gold">
          {formatToman(product.price)}
        </span>
        {product.oldPrice && (
          <span className="text-sm text-sage line-through">
            {formatToman(product.oldPrice)}
          </span>
        )}
        <span className="rounded-full border border-gold/25 px-2.5 py-0.5 text-[10.5px] text-sage">
          {toFa(product.sizeMl)} میلی‌لیتر
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
            soldOut
              ? "bg-red-500/15 text-red-300"
              : "bg-emerald-500/15 text-emerald-300"
          }`}
        >
          {soldOut ? "فعلاً ناموجود" : "موجود در انبار"}
        </span>
      </div>

      <div className="mt-6 space-y-2.5 rounded-2xl glass-panel p-4">
        <NoteRow icon={Droplets} label="نُت آغازی" value={product.topNotes} />
        <NoteRow icon={Heart} label="نُت میانی" value={product.heartNotes} />
        <NoteRow icon={Flame} label="نُت پایانی" value={product.baseNotes} />
        <div className="grid grid-cols-2 gap-2 border-t border-gold/10 pt-2.5">
          <NoteRow
            icon={Clock}
            label="ماندگاری"
            value={product.longevity}
            compact
          />
          <NoteRow icon={Wind} label="پخش بو" value={product.sillage} compact />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2.5">
        <button
          onClick={onAdd}
          disabled={soldOut}
          className="shimmer-btn btn-add flex flex-1 items-center justify-center gap-2 rounded-full py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          <BasketIcon size={17} />
          {soldOut ? "فعلاً ناموجود" : "افزودن به سبد خرید"}
        </button>
        <FavoriteButton productId={product.id} />
      </div>

      {/* نمادها و متن‌های ویژه‌ای که ادمین برای این محصول تعیین کرده —
          مثل «ارسال فوری»، «ضمانت اصالت» یا «هدیهٔ اتومایزر». */}
      {product.highlights && product.highlights.length > 0 && (
        <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {product.highlights.map((h, i) => (
            <li
              key={`${h.icon}-${i}`}
              className="cream-box flex items-center gap-2 rounded-xl border border-gold/15 px-3 py-2.5 transition-colors hover:border-gold/35"
            >
              <SiteIcon name={h.icon} size={18} className="shrink-0" />
              <span className="text-[11px] font-bold leading-5 text-cream/85">
                {h.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteRow({
  icon: Icon,
  label,
  value,
  compact = false,
}: {
  icon: typeof Droplets;
  label: string;
  value?: string;
  compact?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-gold" />
      <p
        className={`flex min-w-0 flex-1 ${
          compact ? "text-[11.5px] text-sage" : "text-[12.5px] text-sage"
        }`}
      >
        <span className="shrink-0 font-bold text-cream/90">{label}: </span>
        {/* نت‌های بلند: یک خط + دکمهٔ «بیشتر» که به دو خط باز می‌شود */}
        <ClampLine text={value} />
      </p>
    </div>
  );
}

/* Favourite */

function FavoriteButton({ productId }: { productId: number }) {
  const { user, refresh } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    setOn(Boolean(user?.favorites?.includes(productId)));
  }, [user, productId]);

  const toggle = async () => {
    if (!user) {
      setHint("برای ذخیره در علاقه‌مندی‌ها وارد حساب شوید.");
      window.setTimeout(() => setHint(""), 2600);
      return;
    }
    setBusy(true);
    const next = !on;
    setOn(next);
    try {
      const res = next
        ? await fetch("/api/account/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId }),
          })
        : await fetch(`/api/account/favorites/${productId}`, {
            method: "DELETE",
          });
      if (!res.ok) setOn(!next);
      else await refresh();
    } catch {
      setOn(!next);
    }
    setBusy(false);
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        title={on ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
        className={`flex h-[50px] w-[50px] items-center justify-center rounded-full border transition-colors ${
          on
            ? "border-gold bg-gold/15 text-gold"
            : "border-gold/25 text-sage hover:text-gold"
        }`}
      >
        <motion.span
          animate={on ? { scale: [1, 1.35, 1] } : { scale: 1 }}
          transition={{ duration: 0.35 }}
        >
          <Heart size={19} fill={on ? "currentColor" : "none"} />
        </motion.span>
      </button>
      {hint && (
        <span className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-lg bg-night px-2.5 py-1.5 text-[10.5px] whitespace-nowrap text-gold-soft shadow-lg">
          {hint}
        </span>
      )}
    </div>
  );
}

/* توضیحات */

function DescriptionTab({ product }: { product: Product }) {
  const legacyBlocks = [
    ...(product.longDescription?.trim()
      ? [
          {
            type: "text" as const,
            text: product.longDescription.trim(),
            heading: "",
            src: "",
          },
        ]
      : []),
    ...(product.gallery || []).map((src) => ({
      type: "image" as const,
      text: "",
      heading: "",
      src,
    })),
  ];
  const blocks = product.descriptionBlocks?.length
    ? product.descriptionBlocks
    : legacyBlocks;
  const intro = product.description?.trim();

  if (!intro && blocks.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-sage">
        توضیحات این محصول هنوز تکمیل نشده است.
      </p>
    );
  }

  return (
    <article className="mx-auto max-w-4xl space-y-7">
      {intro && (
        <div className="cream-box relative overflow-hidden rounded-2xl border border-gold/15 px-5 py-5 sm:px-7">
          <span className="absolute inset-y-0 right-0 w-1 bg-gradient-to-b from-gold via-gold/50 to-transparent" />
          <p
            dir="auto"
            className="whitespace-pre-line text-[14px] leading-8 text-cream/90 sm:text-[15px] sm:leading-9"
          >
            {intro}
          </p>
        </div>
      )}

      {blocks.map((block, index) => {
        if (block.type === "text") {
          const paragraphs = block.text
            .split(/\n\s*\n/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean);
          if (paragraphs.length === 0) return null;
          // توضیح مدیر (v2): هر «بخش متن» = یک باکس واحد؛ سرتیتر درشتِ طلایی
          // بالای همان باکس و همهٔ پاراگراف‌هایش با فاصله داخل همان باکس —
          // دقیقاً مثل نمونهٔ ارسالی: تیتر + متن در یک قاب.
          return (
            <section
              key={`text-${index}`}
              className="cream-box relative overflow-hidden rounded-2xl border border-gold/15 px-5 py-5 sm:px-7"
            >
              <span className="absolute inset-y-0 right-0 w-1 bg-gradient-to-b from-gold via-gold/50 to-transparent" />
              {block.heading?.trim() && (
                <h3
                  dir="auto"
                  className="mb-3 text-[15px] font-black text-gold-soft sm:text-base"
                >
                  {block.heading.trim()}
                </h3>
              )}
              <div className="space-y-4">
                {paragraphs.map((paragraph, paragraphIndex) => (
                  <p
                    key={paragraphIndex}
                    dir="auto"
                    className="whitespace-pre-line break-words text-[14px] leading-8 text-cream/90 sm:text-[15px] sm:leading-9"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          );
        }

        if (block.type === "image" && block.src) {
          return (
            <figure
              key={`image-${index}-${block.src}`}
              className="cream-box overflow-hidden rounded-3xl border border-gold/15 shadow-[0_18px_60px_rgba(0,0,0,0.22)]"
            >
              <Image
                src={block.src}
                alt={block.text || `${product.name} — تصویر توضیحات`}
                width={1400}
                height={900}
                sizes="(max-width: 900px) 100vw, 900px"
                className="h-auto max-h-[720px] w-full object-contain"
                // مستقیم لود می‌شود تا مثل عکس اصلی گالری، بدون لایهٔ
                // بهینه‌ساز کار کند (رفع عکس‌های شکسته توضیحات محصول).
                unoptimized
              />
              {block.text && (
                <figcaption
                  dir="auto"
                  className="border-t border-gold/10 px-4 py-3 text-center text-xs leading-6 text-sage"
                >
                  {block.text}
                </figcaption>
              )}
            </figure>
          );
        }

        if (block.type === "video" && block.src) {
          return (
            <figure
              key={`video-${index}-${block.src}`}
              className="overflow-hidden rounded-3xl border border-gold/15 bg-black/40 shadow-[0_18px_60px_rgba(0,0,0,0.24)]"
            >
              <video
                controls
                playsInline
                preload="metadata"
                src={block.src}
                className="max-h-[720px] w-full bg-black object-contain"
              >
                مرورگر شما امکان پخش این ویدئو را ندارد.
              </video>
              {block.text && (
                <figcaption
                  dir="auto"
                  className="border-t border-gold/10 px-4 py-3 text-center text-xs leading-6 text-sage"
                >
                  {block.text}
                </figcaption>
              )}
            </figure>
          );
        }

        return null;
      })}
    </article>
  );
}

/* ویژگی‌های محصول */

function SpecsTab({ product }: { product: Product }) {
  const rows: Array<[string, string | undefined]> = [
    ["شرکت سازنده", product.manufacturer],
    ["برند سازنده", product.brand],
    ["مناسب برای", product.suitableFor],
    ["نوع غلظت", product.concentration],
    ["حجم محصول", product.sizeMl ? `${toFa(product.sizeMl)} میلی‌لیتر` : ""],
    ["کشور مبدأ برند", product.originCountry],
    ["کشور سازنده", product.madeIn],
    ["نوع رایحه", product.scentType],
    ["ساختار رایحه", product.scentStructure],
    ["فصل پیشنهادی", product.season],
    ["نت آغازی", product.topNotes],
    ["نت میانی", product.heartNotes],
    ["نت پایانی", product.baseNotes],
    ["ماندگاری", product.longevity],
    ["پخش بو", product.sillage],
    ["دسته‌بندی", product.category],
  ];
  const filled = rows.filter(
    ([, value]) => value && String(value).trim().length > 0,
  );

  if (filled.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-sage">
        ویژگی‌های این محصول هنوز تکمیل نشده است.
      </p>
    );
  }

  return (
    <div className="cream-box overflow-hidden rounded-2xl border border-gold/15">
      <table className="w-full text-right text-[12.5px]">
        <tbody>
          {filled.map(([label, value], index) => (
            <motion.tr
              key={label}
              initial={{ opacity: 0, x: 12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.3,
                delay: Math.min(index * 0.03, 0.25),
              }}
              className={index % 2 === 0 ? "glass-soft" : "bg-transparent"}
            >
              <th
                scope="row"
                className="w-40 px-4 py-3 font-bold text-sage sm:w-52"
              >
                {label}
              </th>
              <td className="px-4 py-3 leading-7 text-cream/90">{value}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      <p className="flex items-center gap-1.5 border-t border-gold/10 glass-soft px-4 py-2.5 text-[10.5px] text-sage">
        <Star size={11} className="text-gold" />
        اطلاعات فنی از سوی مدیر فروشگاه ثبت و به‌روز می‌شود.
      </p>
    </div>
  );
}

