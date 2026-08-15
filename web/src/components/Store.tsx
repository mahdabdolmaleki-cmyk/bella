"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  Plus,
  Clock,
  Wind,
  Crown,
  Brain,
  Leaf,
  Gem,
  ArrowLeft,
  Droplets,
  Heart,
  Flame,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpDown,
  Tag,
  Coins,
  X,
} from "lucide-react";
import { ProductVisual } from "./art";
import { Reveal, SectionHeading } from "./ui";
import { useCart } from "./Cart";
import { formatToman, toFa, type ProductDTO } from "@/lib/data";

/* ================================================================== */
/*  PACKAGING CAROUSEL                                                 */
/* ================================================================== */
const PACK = [
  {
    en: "VELVET BAG / 01",
    title: "پاکت مخمل با دوخت طلایی",
    text: "هر شیشه عطر بلّا درون یک پاکت نفیس و دست‌ساز از بهترین پارچه‌های مخمل با دوخت ریشه‌دار طلایی قرار گرفته است.",
  },
  {
    en: "ROYAL BOX / 02",
    title: "جعبه هاردباکس سلطنتی",
    text: "جعبه‌ی مقوایی فشرده با روکش مات زمردی و لوگوی طلاکوب؛ لایه‌ی دوم محافظت و شکوه، پیش از رسیدن به دست شما.",
  },
  {
    en: "SILK RIBBON / 03",
    title: "روبان ابریشمی و مُهر موم",
    text: "گره‌ی پایانی با روبان ابریشمی طلایی و مُهر موم اختصاصی بلّا — نشانی از آن‌که این هدیه، فقط برای شماست.",
  },
];

function PackArt({ i }: { i: number }) {
  if (i === 0)
    return (
      <svg viewBox="0 0 200 180" className="h-44" fill="none">
        <path d="M68 58 C68 18 132 18 132 58" stroke="#d4af37" strokeWidth="7" strokeLinecap="round" />
        <path d="M46 58 L154 58 L143 162 L57 162 Z" fill="#0d2b1b" stroke="#d4af37" strokeWidth="2.5" />
        <path d="M54 66 L146 66 L137 154 L63 154 Z" stroke="#e8cd85" strokeWidth="1" strokeDasharray="4 5" />
      </svg>
    );
  if (i === 1)
    return (
      <svg viewBox="0 0 200 180" className="h-44" fill="none">
        <rect x="35" y="55" width="130" height="95" rx="8" fill="#0d2b1b" stroke="#d4af37" strokeWidth="2.5" />
        <rect x="35" y="55" width="130" height="26" rx="8" fill="#123a25" stroke="#d4af37" strokeWidth="2" />
        <circle cx="100" cy="108" r="20" stroke="#d4af37" strokeWidth="1.5" />
        <text x="100" y="115" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="20" fill="#e8cd85">B</text>
      </svg>
    );
  return (
    <svg viewBox="0 0 200 180" className="h-44" fill="none">
      <path d="M100 78 C70 48 30 60 38 88 C44 110 80 104 100 86 C120 104 156 110 162 88 C170 60 130 48 100 78 Z" fill="#8a6d22" stroke="#e8cd85" strokeWidth="2" />
      <circle cx="100" cy="84" r="12" fill="#d4af37" stroke="#6e5718" strokeWidth="2" />
      <path d="M92 94 L78 140 M108 94 L122 140" stroke="#d4af37" strokeWidth="6" strokeLinecap="round" />
      <circle cx="100" cy="84" r="5" fill="#0b2417" />
    </svg>
  );
}

export function PackagingSection({ heading = true }: { heading?: boolean } = {}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % PACK.length), 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-5">
        {heading && (
          <SectionHeading
            eyebrow="LUXURY PRESENTATION"
            title="هنر آراستن و بسته‌بندی سلطنتی بلّا"
            sub="از لحظه‌ی سفارش تا لحظه‌ی گشودن پاکت، همه‌چیز یک مراسم است."
          />
        )}

        <Reveal delay={0.15} className="mt-14">
          <div className="gold-ring relative overflow-hidden rounded-3xl glass-card p-7 md:p-10">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -24 }}
                    transition={{ duration: 0.5 }}
                  >
                    <p className="font-display text-xs font-semibold tracking-[0.4em] text-gold">
                      {PACK[idx].en}
                    </p>
                    <h3 className="mt-3 text-2xl font-black text-cream">{PACK[idx].title}</h3>
                    <p className="mt-4 text-sm leading-8 text-sage">{PACK[idx].text}</p>
                  </motion.div>
                </AnimatePresence>

                <div className="mt-8 flex items-center gap-2">
                  {PACK.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setIdx(i)}
                      aria-label={`اسلاید ${toFa(i + 1)}`}
                      className={`h-2 rounded-full transition-all duration-500 ${
                        i === idx ? "w-8 bg-gold" : "w-2 bg-gold/30 hover:bg-gold/60"
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={() => setIdx((i) => (i + 1) % PACK.length)}
                  className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold/35 px-5 py-2.5 text-xs font-bold text-gold-soft transition-colors hover:bg-gold/10"
                >
                  مرحله بعد: {PACK[(idx + 1) % PACK.length].title}
                  <ArrowLeft size={14} />
                </button>
              </div>

              <div className="flex items-center justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.8, rotate: -6 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.85, rotate: 6 }}
                    transition={{ duration: 0.5 }}
                    className="animate-bob"
                  >
                    <PackArt i={idx} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  BENEFITS — asymmetric numbered rows                                */
/* ================================================================== */
const BENEFITS = [
  { icon: Crown, t: "اعتمادبه‌نفس بی‌صدا", d: "عطر خوب پیش از شما وارد اتاق می‌شود و پس از شما باقی می‌ماند؛ حضوری که نیازی به کلمه ندارد." },
  { icon: Brain, t: "حافظه‌ی بویایی", d: "مغز انسان رایحه‌ها را در عمیق‌ترین بخش خاطرات ذخیره می‌کند؛ عطر شما، امضای ماندگار شماست." },
  { icon: Leaf, t: "آرامشِ آروماتراپی", d: "نت‌های طبیعی اسطوخودوس، صندل و مرکبات بر سیستم عصبی اثر گذاشته و استرس روزمره را کاهش می‌دهند." },
  { icon: Gem, t: "اثرگذاری ماندگار", d: "تحقیقات نشان می‌دهد افراد خوش‌عطر، جذاب‌تر، مسلط‌تر و به‌یادماندنی‌تر به نظر می‌رسند." },
];

export function BenefitsSection() {
  return (
    <section className="relative py-14 sm:py-20" id="benefits">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-forest/40 to-transparent" />
      <div className="relative mx-auto max-w-5xl px-5">
        <SectionHeading
          eyebrow="WHY PERFUME"
          title="چرا عطر زدن، یک ضرورت است؟"
          sub="فراتر از خوشبویی؛ تأثیری که رایحه بر ذهن، mood و تصویر شما از خود می‌گذارد."
        />

        <div className="mt-16 space-y-2">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.t} delay={i * 0.08}>
              <div
                className={`group flex items-center gap-5 rounded-2xl border border-transparent p-5 transition-all duration-500 hover:border-gold/25 hover:bg-forest/50 md:gap-8 md:p-7 ${
                  i % 2 === 1 ? "md:flex-row-reverse md:text-left" : ""
                }`}
              >
                <span className="font-display text-4xl font-bold text-gold/25 transition-colors duration-500 group-hover:text-gold/60 md:text-6xl">
                  {toFa(String(i + 1).padStart(2, "0"))}
                </span>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold/35 bg-gold/10 text-gold transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
                  <b.icon size={22} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-black text-cream md:text-xl">{b.t}</h3>
                  <p className="mt-1.5 text-sm leading-7 text-sage">{b.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  PRODUCTS GRID                                                      */
/* ================================================================== */
/**
 * یک گروه از گزینه‌های فیلتر (برند، رایحه، غلظت، …).
 * اگر هیچ محصولی این مشخصه را پر نکرده باشد، گروه اصلاً رندر نمی‌شود
 * تا پنل پر از عنوان‌های خالی نشود.
 */
function FilterGroup({
  title,
  icon,
  options,
  selected,
  onToggle,
  render,
}: {
  title: string;
  icon: ReactNode;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  render?: (value: string) => string;
}) {
  if (!options.length) return null;
  return (
    <div>
      <span className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-gold-soft">
        {icon} {title}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-all duration-300 ${
                on
                  ? "bg-gold text-[#241a05] shadow-[0_4px_14px_rgba(212,175,55,0.35)]"
                  : "border border-gold/25 text-sage hover:border-gold/50 hover:text-cream"
              }`}
            >
              {render ? render(opt) : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** فهرست گزینه‌های فیلتر که سرور از دل خود محصولات بیرون می‌کشد. */
type Facets = {
  brands: string[];
  concentrations: string[];
  seasons: string[];
  scentTypes: string[];
  sizes: number[];
  priceMin: number;
  priceMax: number;
};

const SORTS: Array<{ key: string; label: string }> = [
  { key: "newest", label: "جدیدترین" },
  { key: "price-asc", label: "ارزان‌ترین" },
  { key: "price-desc", label: "گران‌ترین" },
  { key: "bestseller", label: "پرف��وش‌ترین" },
];

/** دسته‌های پیش‌فرض — اگر ادمین در تنظیمات چیزی نساخته باشد. */
const FALLBACK_CATEGORIES = ["زنانه", "مردانه", "یونیسکس"];

export function ProductsSection({
  heading = true,
  categories,
}: { heading?: boolean; categories?: string[] } = {}) {
  const [rows, setRows] = useState<ProductDTO[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("همه");
  const [q, setQ] = useState("");
  const { add } = useCart();

  // ── فیلترهای پیشرفته ──────────────────────────────────
  // همهٔ این‌ها به سرور فرستاده می‌شوند، نه در مرورگر فیلتر می‌شوند؛
  // وگرنه باید کل کاتالوگ دانلود می‌شد.
  const [facets, setFacets] = useState<Facets | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [scents, setScents] = useState<string[]>([]);
  const [concentrations, setConcentrations] = useState<string[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState("newest");
  const [panelOpen, setPanelOpen] = useState(false);

  const cats = useMemo(
    () => ["همه", ...(categories?.length ? categories : FALLBACK_CATEGORIES)],
    [categories],
  );

  useEffect(() => {
    let alive = true;
    fetch("/api/products/filters")
      .then((r) => r.json())
      .then((d) => alive && setFacets(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (
    value: string,
    list: string[],
    setList: (next: string[]) => void,
  ) => setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const activeCount =
    brands.length +
    scents.length +
    concentrations.length +
    seasons.length +
    sizes.length +
    (priceMin ? 1 : 0) +
    (priceMax ? 1 : 0) +
    (inStock ? 1 : 0);

  const resetFilters = () => {
    setBrands([]);
    setScents([]);
    setConcentrations([]);
    setSeasons([]);
    setSizes([]);
    setPriceMin("");
    setPriceMax("");
    setInStock(false);
    setSort("newest");
  };

  // PERF/BUG FIX: this used to download the WHOLE catalogue once and filter it
  // in the browser, so the search box ignored the server's own search endpoint
  // and the payload grew with every product added. The query is now sent to the
  // API, debounced, and stale responses are aborted so results cannot arrive
  // out of order.
  const load = useCallback(
    (signal?: AbortSignal) => {
      setError(false);
      const params = new URLSearchParams();
      const term = q.trim();
      if (term) params.set("search", term);
      if (filter !== "همه") params.set("category", filter);
      brands.forEach((v) => params.append("brand", v));
      scents.forEach((v) => params.append("scent", v));
      concentrations.forEach((v) => params.append("concentration", v));
      seasons.forEach((v) => params.append("season", v));
      sizes.forEach((v) => params.append("size", v));
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
      if (inStock) params.set("inStock", "1");
      if (sort !== "newest") params.set("sort", sort);
      const qs = params.toString();
      fetch(`/api/products${qs ? `?${qs}` : ""}`, { signal })
        .then((r) => r.json())
        .then((d) => setRows(d.products ?? []))
        .catch((err) => {
          if ((err as { name?: string })?.name !== "AbortError") setError(true);
        });
    },
    [
      q,
      filter,
      brands,
      scents,
      concentrations,
      seasons,
      sizes,
      priceMin,
      priceMax,
      inStock,
      sort,
    ],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => load(ctrl.signal), q.trim() ? 350 : 0);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [load, q]);

  // فیلتر دوبارهٔ سمت مرورگر حذف شد: حالا سرور دقیقاً همان چیزی را برمی‌گرداند
  // که باید نمایش داده شود؛ نگه داشتنش فقط نتیجهٔ فیلترهای تازه را دوباره قیچی می‌کرد.

  return (
    <section className="relative py-14 sm:py-20" id="shop">
      <div className="mx-auto max-w-6xl px-5">
        {heading && (
          <SectionHeading
            eyebrow="THE COLLECTION"
            title="کلکسیون عطرهای بلّا"
            sub="هر شیشه، روایتی از سرزمین‌های دوردست و باغ‌های ایرانی — دست‌چین برای سلیقه‌های خاص."
          />
        )}

        <Reveal delay={0.1} className="mt-10 flex flex-wrap justify-center gap-2">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full px-5 py-2 text-xs font-bold transition-all duration-300 ${
                filter === c
                  ? "bg-gold text-[#241a05] shadow-[0_4px_18px_rgba(212,175,55,0.4)]"
                  : "border border-gold/30 text-gold-soft hover:bg-gold/10"
              }`}
            >
              {c}
            </button>
          ))}
        </Reveal>

        <Reveal delay={0.15} className="mx-auto mt-5 max-w-md">
          <div className="flex items-center gap-2 rounded-full glass-panel px-4 py-2.5 transition-colors focus-within:border-gold/60">
            <Search size={15} className="text-gold/70" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو در نام، رایحه یا نُت‌ها…"
              className="w-full bg-transparent text-sm text-cream placeholder:text-sage/40 focus:outline-none"
            />
          </div>
        </Reveal>

        {/* ── پنل فیلتر ──────────────────────────────────── */}
        <div className="mx-auto mt-4 max-w-3xl">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-xs font-bold text-gold-soft transition-colors hover:bg-gold/10"
            >
              <SlidersHorizontal size={14} />
              فیلتر پیشرفته
              {activeCount > 0 && (
                <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-black text-[#241a05]">
                  {toFa(activeCount)}
                </span>
              )}
              <ChevronDown
                size={13}
                className={`transition-transform ${panelOpen ? "rotate-180" : ""}`}
              />
            </button>

            <div className="flex items-center gap-1.5 rounded-full glass-soft px-3 py-1.5">
              <ArrowUpDown size={13} className="text-sky-300" />
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                    sort === s.key ? "bg-gold/20 text-gold" : "text-sage hover:text-cream"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {activeCount > 0 && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 px-4 py-2 text-[11px] font-bold text-rose-200 transition-colors hover:bg-rose-300/10"
              >
                <X size={12} /> پاک کردن فیلترها
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {panelOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-4 rounded-3xl glass-panel p-4 sm:p-5">
                  <FilterGroup
                    title="برند"
                    icon={<Tag size={13} className="text-amber-300" />}
                    options={facets?.brands ?? []}
                    selected={brands}
                    onToggle={(v) => toggle(v, brands, setBrands)}
                  />
                  <FilterGroup
                    title="رایحه"
                    icon={<Droplets size={13} className="text-sky-300" />}
                    options={facets?.scentTypes ?? []}
                    selected={scents}
                    onToggle={(v) => toggle(v, scents, setScents)}
                  />
                  <FilterGroup
                    title="غلظت"
                    icon={<Gem size={13} className="text-fuchsia-300" />}
                    options={facets?.concentrations ?? []}
                    selected={concentrations}
                    onToggle={(v) => toggle(v, concentrations, setConcentrations)}
                  />
                  <FilterGroup
                    title="فصل مناسب"
                    icon={<Leaf size={13} className="text-emerald-300" />}
                    options={facets?.seasons ?? []}
                    selected={seasons}
                    onToggle={(v) => toggle(v, seasons, setSeasons)}
                  />
                  <FilterGroup
                    title="حجم (میلی‌لیتر)"
                    icon={<Wind size={13} className="text-violet-300" />}
                    options={(facets?.sizes ?? []).map(String)}
                    selected={sizes}
                    onToggle={(v) => toggle(v, sizes, setSizes)}
                    render={(v) => toFa(Number(v))}
                  />

                  <div className="flex flex-wrap items-center gap-3 border-t border-gold/10 pt-4">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-gold-soft">
                      <Coins size={13} className="text-amber-300" /> محدودهٔ قیمت (تومان)
                    </span>
                    <input
                      type="number"
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                      placeholder="از"
                      className="w-28 rounded-xl glass-input px-3 py-2 text-xs text-cream placeholder:text-sage/40 focus:outline-none"
                    />
                    <input
                      type="number"
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value)}
                      placeholder="تا"
                      className="w-28 rounded-xl glass-input px-3 py-2 text-xs text-cream placeholder:text-sage/40 focus:outline-none"
                    />
                    <label className="flex items-center gap-2 text-xs text-sage">
                      <input
                        type="checkbox"
                        className="glass-check"
                        checked={inStock}
                        onChange={(e) => setInStock(e.target.checked)}
                      />
                      فقط کالاهای موجود
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error ? (
          <div className="mt-16 text-center">
            <p className="text-sm text-sage">خطا در دریافت محصولات.</p>
            <button onClick={() => load()} className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/40 px-5 py-2.5 text-xs font-bold text-gold-soft hover:bg-gold/10">
              <RefreshCw size={14} /> تلاش دوباره
            </button>
          </div>
        ) : !rows ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[420px] animate-pulse rounded-3xl glass-panel" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-16 text-center text-sm text-sage">محصولی با این مشخصات پیدا نشد.</p>
        ) : (
          <motion.div layout className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {rows.map((pr, i) => (
                <motion.article
                  layout
                  key={pr.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.6, delay: (i % 3) * 0.1 }}
                  className="group relative flex flex-col overflow-hidden rounded-3xl border border-gold/15 bg-gradient-to-b from-forest/80 to-night p-6 transition-all duration-500 hover:-translate-y-2 hover:border-gold/50 hover:shadow-[0_20px_60px_rgba(212,175,55,0.15)]"
                >
                  {pr.badge && (
                    <span className="absolute top-4 right-4 z-10 rounded-full bg-gold px-3 py-1 text-[10px] font-black text-[#241a05]">
                      {pr.badge}
                    </span>
                  )}

                  <Link
                    href={`/shop/${pr.id}`}
                    className="relative flex h-52 items-center justify-center"
                  >
                    <div className="absolute h-40 w-40 rounded-full bg-gold/10 blur-3xl transition-all duration-700 group-hover:bg-gold/25" />
                    <ProductVisual
                      image={pr.image}
                      glass={pr.glass}
                      liquid={pr.liquid}
                      alt={pr.name}
                      className="relative w-24 drop-shadow-[0_18px_30px_rgba(0,0,0,0.6)] transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-2"
                    />
                  </Link>

                  <div className="mt-4 flex items-baseline justify-between gap-2">
                    <Link href={`/shop/${pr.id}`} className="text-lg font-black text-cream transition-colors hover:text-gold">
                      {pr.name}
                    </Link>
                    <span className="font-script text-lg text-gold">{pr.nameEn}</span>
                  </div>
                  <p className="mt-1 text-xs text-sage">{pr.tagline}</p>

                  <div className="mt-4 space-y-1.5 border-t border-gold/10 pt-4 text-[11px] text-sage">
                    <p className="flex items-center gap-2"><Droplets size={12} className="text-gold" /> آغاز: {pr.topNotes}</p>
                    <p className="flex items-center gap-2"><Heart size={12} className="text-gold" /> قلب: {pr.heartNotes}</p>
                    <p className="flex items-center gap-2"><Flame size={12} className="text-gold" /> پایه: {pr.baseNotes}</p>
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-[11px] text-sage">
                    <span className="flex items-center gap-1.5"><Clock size={12} className="text-gold" /> {pr.longevity}</span>
                    <span className="h-3 w-px bg-gold/25" />
                    <span className="flex items-center gap-1.5"><Wind size={12} className="text-gold" /> {pr.sillage}</span>
                  </div>

                  <div className="mt-5 flex items-end justify-between gap-3 border-t border-gold/10 pt-4">
                    <div>
                      {pr.oldPrice && (
                        <p className="text-[11px] text-sage/60 line-through">{formatToman(pr.oldPrice)}</p>
                      )}
                      <p className="text-base font-black text-gold-soft">{formatToman(pr.price)}</p>
                    </div>
                    <button
                      disabled={pr.inStock === false}
                      onClick={() =>
                        add({ id: pr.id, name: pr.name, price: pr.price, glass: pr.glass, liquid: pr.liquid, sizeMl: pr.sizeMl, image: pr.image })
                      }
                      className="flex items-center gap-1.5 rounded-full bg-gold px-4 py-2.5 text-xs font-black text-[#241a05] transition-all hover:scale-105 hover:shadow-[0_6px_20px_rgba(212,175,55,0.45)] active:scale-90 disabled:cursor-not-allowed disabled:bg-sage/30 disabled:text-sage disabled:hover:scale-100 disabled:hover:shadow-none"
                    >
                      <Plus size={14} />
                      {pr.inStock === false ? "ناموجود" : "افزودن"}
                    </button>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </section>
  );
}
