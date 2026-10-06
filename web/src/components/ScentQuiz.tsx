"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { BasketIcon } from "./BasketIcon";
import { ProductVisual } from "./art";
import { SectionHeading } from "./ui";
import SiteIcon from "./SiteIcon";
import { useCart } from "./Cart";
import { formatToman, toFa, type ProductDTO } from "@/lib/data";

/* ====================================================================== */
/*  عطرشناسی شخصیت — personality based scent finder                       */
/*                                                                        */
/*  Six behavioural questions (how a free evening is spent, the role in a  */
/*  group, how decisions are made…). Each answer nudges a set of scent     */
/*  axes; at the end the profile is matched against the real catalogue and */
/*  the three closest bottles are recommended. Everything runs in the      */
/*  browser: no extra API, nothing stored about the visitor.               */
/* ====================================================================== */

type Axis = "fresh" | "floral" | "woody" | "sweet" | "spicy" | "bold" | "soft";
type Weights = Partial<Record<Axis, number>>;
type Question = { q: string; hint?: string; options: Array<{ label: string; w: Weights }> };

const QUESTIONS: Question[] = [
  {
    q: "یک عصر آزاد را چطور می‌گذرانید؟",
    hint: "اولین گزینه‌ای که به دلتان می‌نشیند را انتخاب کنید.",
    options: [
      { label: "پیاده‌روی در هوای خنک و کنار درخت‌ها", w: { fresh: 3, soft: 1 } },
      { label: "مهمانی شب با دوستان و موسیقی", w: { bold: 3, spicy: 2 } },
      { label: "کتاب، چای و یک پتوی گرم", w: { sweet: 2, soft: 3 } },
      { label: "کار روی پروژهٔ شخصی در سکوت", w: { woody: 3, soft: 1 } },
    ],
  },
  {
    q: "در جمع تازه معمولاً چه نقشی دارید؟",
    options: [
      { label: "زود وارد گفت‌وگو می‌شوم و جمع را گرم می‌کنم", w: { bold: 3, spicy: 1 } },
      { label: "اول تماشا می‌کنم، بعد با چند نفر عمیق صحبت می‌کنم", w: { woody: 2, soft: 2 } },
      { label: "میزبان مهربانی هستم که حواسم به همه هست", w: { floral: 3, sweet: 1 } },
      { label: "ساده و بی‌تکلف، بدون جلب توجه", w: { fresh: 2, soft: 3 } },
    ],
  },
  {
    q: "تصمیم‌های مهم را چطور می‌گیرید؟",
    options: [
      { label: "سریع و با اتکا به شهود", w: { bold: 2, spicy: 3 } },
      { label: "فهرست می‌نویسم و دقیق می‌سنجم", w: { woody: 3, fresh: 1 } },
      { label: "با کسانی که دوستشان دارم مشورت می‌کنم", w: { floral: 2, soft: 2 } },
      { label: "صبر می‌کنم تا حالم آرام شود، بعد تصمیم می‌گیرم", w: { soft: 3, sweet: 1 } },
    ],
  },
  {
    q: "سلیقهٔ لباس و رنگ شما بیشتر به کدام نزدیک است؟",
    options: [
      { label: "سفید، سیاه و خط‌های مینیمال", w: { fresh: 3, woody: 1 } },
      { label: "طلایی، زرشکی و پارچه‌های مجلل", w: { bold: 3, spicy: 2 } },
      { label: "پودری، گلبهی و روشن", w: { floral: 3, soft: 1 } },
      { label: "قهوه‌ای، کرم و بافت گرم", w: { sweet: 2, woody: 2 } },
    ],
  },
  {
    q: "دوست دارید بوی عطرتان تا کجا برود؟",
    options: [
      { label: "فقط خودم و کسی که نزدیکم است بفهمیم", w: { soft: 4 } },
      { label: "در حد یک میز کاری یا کلاس", w: { fresh: 2, floral: 1 } },
      { label: "وقتی وارد می‌شوم محسوس باشد", w: { bold: 3, spicy: 1 } },
      { label: "بعد از رفتنم هم بماند", w: { bold: 4, woody: 2 } },
    ],
  },
  {
    q: "کدام خاطره بیشتر دلتان را گرم می‌کند؟",
    options: [
      { label: "بوی باران روی برگ و نارنج", w: { fresh: 4 } },
      { label: "باغ گل مادربزرگ در بهار", w: { floral: 4 } },
      { label: "شیرینی تازه و وانیل در آشپزخانه", w: { sweet: 4 } },
      { label: "چوب و دود شومینه در شب زمستان", w: { woody: 4, spicy: 1 } },
    ],
  },
];

// Words that mark a product as belonging to an axis. Matched against notes,
// scent family, season and the marketing copy — whatever the admin filled in.
const AXIS_WORDS: Record<Axis, string[]> = {
  fresh: [
    "مرکبات",
    "سیتروس",
    "لیمو",
    "برگاموت",
    "پرتقال",
    "نارنج",
    "تازه",
    "سبز",
    "نعنا",
    "آبی",
    "دریایی",
    "خیار",
    "لاواند",
    "citrus",
    "fresh",
    "aquatic",
  ],
  floral: [
    "گل",
    "گلی",
    "رز",
    "یاس",
    "مریم",
    "زنبق",
    "پیونی",
    "مگنولیا",
    "بنفشه",
    "شکوفه",
    "پودری",
    "floral",
    "rose",
    "jasmine",
  ],
  woody: [
    "چوب",
    "چوبی",
    "عود",
    "صندل",
    "سدر",
    "وتیور",
    "خزه",
    "دودی",
    "چرم",
    "تنباکو",
    "کهربا",
    "مشک",
    "woody",
    "oud",
    "vetiver",
    "leather",
  ],
  sweet: [
    "وانیل",
    "شیرین",
    "کارامل",
    "عسل",
    "شکلات",
    "پرالین",
    "بادام",
    "تونکا",
    "میوه",
    "توت",
    "هلو",
    "gourmand",
    "vanilla",
    "sweet",
  ],
  spicy: [
    "ادویه",
    "دارچین",
    "زنجبیل",
    "فلفل",
    "زعفران",
    "میخک",
    "گرم",
    "شرقی",
    "spicy",
    "amber",
    "oriental",
  ],
  bold: ["سنگین", "قوی", "بالا", "عالی", "طولانی"],
  soft: ["ملایم", "سبک", "متوسط", "نزدیک", "محدود", "پوستی"],
};

const AXIS_LABEL: Record<Axis, string> = {
  fresh: "تازه و مرکباتی",
  floral: "گلی و لطیف",
  woody: "چوبی و عمیق",
  sweet: "شیرین و خوراکی",
  spicy: "ادویه‌ای و گرم",
  bold: "ردپای قوی",
  soft: "حضور ملایم",
};

function haystack(p: ProductDTO) {
  return [
    p.topNotes,
    p.heartNotes,
    p.baseNotes,
    p.scentType,
    p.scentStructure,
    p.tagline,
    p.description,
    p.season,
    p.longevity,
    p.sillage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function ScentQuiz({ icon }: { icon?: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [products, setProducts] = useState<ProductDTO[] | null>(null);
  const { add } = useCart();

  const finished = answers.length === QUESTIONS.length;

  // The catalogue is only fetched once the visitor actually starts answering,
  // so this section costs nothing for people who just scroll past it.
  useEffect(() => {
    if (answers.length === 0 || products !== null) return;
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch(() => setProducts([]));
  }, [answers.length, products]);

  const profile = useMemo(() => {
    const total: Record<Axis, number> = {
      fresh: 0,
      floral: 0,
      woody: 0,
      sweet: 0,
      spicy: 0,
      bold: 0,
      soft: 0,
    };
    answers.forEach((choice, i) => {
      const w = QUESTIONS[i]?.options[choice]?.w || {};
      (Object.keys(w) as Axis[]).forEach((k) => {
        total[k] += w[k] || 0;
      });
    });
    return total;
  }, [answers]);

  const topAxes = useMemo(
    () =>
      (Object.keys(profile) as Axis[])
        .filter((a) => profile[a] > 0)
        .sort((a, b) => profile[b] - profile[a])
        .slice(0, 3),
    [profile]
  );

  const picks = useMemo(() => {
    if (!finished || !products || products.length === 0) return [];
    const maxAxis = Math.max(1, ...(Object.values(profile) as number[]));

    const scored = products.map((p) => {
      const text = haystack(p);
      let score = 0;
      (Object.keys(profile) as Axis[]).forEach((axis) => {
        const weight = profile[axis] / maxAxis; // 0..1
        if (weight <= 0) return;
        const hits = AXIS_WORDS[axis].filter((w) => text.includes(w.toLowerCase())).length;
        if (hits > 0) score += weight * Math.min(hits, 4) * 3;
      });
      if (p.bestseller) score += 1.5; // tie-breaker only
      return { p, score };
    });

    // Even a catalogue with no notes filled in still returns three bottles
    // instead of an empty result.
    scored.sort((a, b) => b.score - a.score || b.p.price - a.p.price);
    return scored.slice(0, 3).map((s) => s.p);
  }, [finished, products, profile]);

  const choose = useCallback((index: number) => {
    setAnswers((prev) => [...prev, index]);
    setStep((prev) => prev + 1);
  }, []);

  const back = () => {
    if (answers.length === 0) return;
    setAnswers((prev) => prev.slice(0, -1));
    setStep((prev) => Math.max(0, prev - 1));
  };

  const restart = () => {
    setAnswers([]);
    setStep(0);
  };

  const current = QUESTIONS[step];
  const progress = Math.round((answers.length / QUESTIONS.length) * 100);

  return (
    <section className="relative py-16 sm:py-24" id="scent-quiz">
      <div className="relative mx-auto max-w-3xl px-5">
        <SectionHeading
          eyebrow="SCENT PROFILER"
          title="عطر شخصیت شما کدام است؟"
          sub="شش پرسش کوتاه دربارهٔ رفتار و سلیقهٔ شما؛ در پایان سه عطر متناسب پیشنهاد می‌دهیم."
        />

        <div className="glass-card gold-ring mt-10 rounded-3xl p-5 sm:p-7">
          {/* ---------- progress ---------- */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-gold/10">
              <SiteIcon name={icon} fallback="brain" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-night/70">
                <motion.div
                  animate={{ width: `${finished ? 100 : progress}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-l from-gold to-gold-deep"
                />
              </div>
              <p className="mt-1.5 text-[10.5px] text-sage">
                {finished
                  ? "تحلیل کامل شد"
                  : `پرسش ${toFa(answers.length + 1)} از ${toFa(QUESTIONS.length)}`}
              </p>
            </div>
          </div>

          {/* ---------- body ---------- */}
          <AnimatePresence mode="wait">
            {!finished && current ? (
              <motion.div
                key={`q-${step}`}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
                className="mt-6"
              >
                <h3 className="text-base font-black text-cream sm:text-lg">{current.q}</h3>
                {current.hint && <p className="mt-1 text-[11px] text-sage">{current.hint}</p>}

                <div className="mt-4 grid gap-2.5">
                  {current.options.map((o, i) => (
                    <motion.button
                      key={o.label}
                      type="button"
                      onClick={() => choose(i)}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.05 }}
                      whileTap={{ scale: 0.98 }}
                      className="group flex items-center gap-3 rounded-2xl glass-input px-4 py-3.5 text-right text-[12.5px] leading-6 text-cream transition-colors hover:bg-gold/10 sm:text-sm"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/35 text-[10px] font-black text-gold">
                        {toFa(i + 1)}
                      </span>
                      <span className="min-w-0 flex-1">{o.label}</span>
                      <ArrowLeft
                        size={14}
                        className="shrink-0 text-transparent transition-colors group-hover:text-gold"
                      />
                    </motion.button>
                  ))}
                </div>

                {answers.length > 0 && (
                  <button
                    type="button"
                    onClick={back}
                    className="mt-4 text-[11px] text-sage underline hover:text-gold"
                  >
                    بازگشت به پرسش قبلی
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="mt-6"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-sage">پروفایل رایحهٔ شما:</span>
                  {topAxes.map((a) => (
                    <span
                      key={a}
                      className="rounded-full border border-gold/45 bg-gold/12 px-3 py-1 text-[10.5px] font-black text-gold"
                    >
                      {AXIS_LABEL[a]}
                    </span>
                  ))}
                </div>

                {products === null ? (
                  <p className="mt-6 flex items-center gap-2 text-xs text-sage">
                    <Loader2 size={14} className="animate-spin" /> در حال انتخاب عطرهای مناسب…
                  </p>
                ) : picks.length === 0 ? (
                  <p className="mt-6 text-xs text-sage">
                    فعلاً محصولی برای پیشنهاد در دسترس نیست.
                  </p>
                ) : (
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {picks.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.08 }}
                        className="group relative flex flex-col rounded-2xl glass-panel p-4 pt-8"
                      >
                        <span className="absolute top-3 left-3 rounded-full bg-gold/20 px-2 py-0.5 text-[9px] font-black text-gold">
                          {i === 0 ? "بهترین تطابق" : `گزینهٔ ${toFa(i + 1)}`}
                        </span>

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
                          className="mt-2 truncate text-center text-[13px] font-black text-cream transition-colors hover:text-gold"
                        >
                          {p.name}
                        </Link>
                        <p className="mt-0.5 line-clamp-2 min-h-8 text-center text-[10.5px] leading-5 text-sage">
                          {p.tagline}
                        </p>
                        <p className="mt-1 text-center text-[12px] font-black text-gold">
                          {formatToman(p.price)}
                        </p>

                        <button
                          type="button"
                          onClick={() => add(p)}
                          className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-gold/35 py-2 text-[11px] font-bold text-gold transition-colors hover:bg-gold/10"
                        >
                          <BasketIcon size={12} /> افزودن به سبد
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={restart}
                    className="flex items-center gap-1.5 rounded-full border border-gold/30 px-4 py-2 text-[11px] font-bold text-gold hover:bg-gold/10"
                  >
                    <RotateCcw size={12} /> تکرار آزمون
                  </button>
                  <Link
                    href="/shop"
                    className="flex items-center gap-1.5 text-[11px] font-bold text-sage hover:text-gold"
                  >
                    <Sparkles size={12} /> دیدن همهٔ عطرها
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
