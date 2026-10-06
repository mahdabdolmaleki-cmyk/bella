"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, type Transition } from "framer-motion";
import Link from "next/link";
import {
  Candy,
  Coffee,
  Snowflake,
  Flame,
  TreePine,
  Citrus,
  Sparkles,
  Flower2,
  IceCreamCone,
  Briefcase,
  Crown,
  Check,
  ArrowLeft,
  RotateCcw,
  Undo2,
  Star,
  Instagram,
  type LucideIcon,
} from "lucide-react";
import { SectionHeading } from "./ui";

/* ==================================================================== */
/*  «عطر شما کدام است؟» — گفت‌وگو با «مشاور عطر بلا»                      */
/*                                                                      */
/*  انیمیشن‌ها فقط transform و opacity را تغییر می‌دهند (روی GPU) و با       */
/*  فنر نرم framer-motion اجرا می‌شوند؛ اسکرول فقط داخل خود جعبهٔ گفت‌وگو     */
/*  است و صفحه را جابه‌جا نمی‌کند.                                           */
/* ==================================================================== */

type FormData = {
  forWhom: string;
  gender: string;
  ageRange: string;
  occasions: string[];
  image: string[];
  scentStyles: string[];
  criteria: string;
  effect: string;
  budget: string;
  name: string;
  phone: string;
};

type ChoiceKey = Exclude<keyof FormData, "name" | "phone">;
type MultiKey = "occasions" | "image" | "scentStyles";

const initialForm: FormData = {
  forWhom: "",
  gender: "",
  ageRange: "",
  occasions: [],
  image: [],
  scentStyles: [],
  criteria: "",
  effect: "",
  budget: "",
  name: "",
  phone: "",
};

const OPTIONS: Record<ChoiceKey, string[]> = {
  forWhom: ["خودم", "هدیه برای خانم", "هدیه برای آقا", "هدیه برای همسر/پارتنر", "هدیه سازمانی یا رسمی"],
  gender: ["زنانه", "مردانه", "یونی‌سکس (مشترک)"],
  ageRange: ["زیر ۲۰ سال", "۲۰ تا ۳۰ سال", "۳۰ تا ۴۰ سال", "۴۰ تا ۵۰ سال", "بالای ۵۰ سال"],
  occasions: ["استفاده روزانه", "محل کار", "جلسات رسمی", "قرارهای خاص", "مهمانی و مراسم", "استفاده در تمام موقعیت‌ها"],
  image: ["شیک و باکلاس", "جذاب و خاص", "آرام و دوست‌داشتنی"],
  scentStyles: ["شیرین", "تلخ", "خنک و تازه", "گرم و عمیق", "چوبی", "مرکباتی", "ادویه‌ای", "گلی", "وانیلی", "چرمی", "شرقی و لوکس"],
  criteria: ["ماندگاری بالا", "خاص بودن رایحه", "بازخورد گرفتن از دیگران", "مناسب بودن برای شخصیت من", "ارزش خرید", "برند و اعتبار"],
  effect: [
    "وقتی وارد جمع می‌شوم دیده شوم",
    "احساس اعتمادبه‌نفس بیشتری داشته باشم",
    "همیشه مرتب و خوشبو باشم",
    "یک امضای شخصی داشته باشم",
    "خاطره‌ای در ذهن دیگران ایجاد کنم",
  ],
  budget: ["اقتصادی", "متوسط", "لوکس", "محدودیتی ندارم، انتخاب درست مهم‌تر است"],
};

const SCENT_ICONS: Record<string, LucideIcon> = {
  شیرین: Candy,
  تلخ: Coffee,
  "خنک و تازه": Snowflake,
  "گرم و عمیق": Flame,
  چوبی: TreePine,
  مرکباتی: Citrus,
  "ادویه‌ای": Sparkles,
  گلی: Flower2,
  وانیلی: IceCreamCone,
  چرمی: Briefcase,
  "شرقی و لوکس": Crown,
};

type Question = { key: ChoiceKey; text: string; hint?: string; multi?: boolean; lead?: string };

const QUESTIONS: Question[] = [
  { key: "forWhom", text: "عطر برای چه کسی انتخاب می‌شود؟" },
  { key: "gender", text: "جنسیت استفاده‌کننده؟" },
  { key: "ageRange", text: "رده‌ی سنی؟" },
  { key: "occasions", lead: "عالی!", text: "بیشتر در چه موقعیت‌هایی عطر می‌زنید؟", hint: "می‌توانید چند گزینه را انتخاب کنید", multi: true },
  { key: "image", text: "دوست دارید عطرتان چه تصویری از شما بسازد؟", hint: "یک یا چند گزینه", multi: true },
  { key: "scentStyles", text: "چه سبک رایحه‌هایی را بیشتر دوست دارید؟", hint: "هر چندتا که دوست دارید", multi: true },
  { key: "criteria", text: "مهم‌ترین معیار شما در انتخاب عطر چیست؟" },
  { key: "effect", lead: "سؤال جالبی است…", text: "دوست دارید عطرتان چه اثری بگذارد؟" },
  { key: "budget", text: "بودجه‌ی شما برای انتخاب؟" },
];

const CONTACT_STEP = QUESTIONS.length; // ۹ ← سؤال دهم: نام و شماره
const TOTAL = QUESTIONS.length + 1; // ۱۰

const fa = (n: number) => n.toLocaleString("fa-IR");
const toEnDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const validPhone = (s: string) => /^(\+98|0098|0)?9\d{9}$/.test(toEnDigits(s).replace(/[\s-]/g, ""));

const answerText = (form: FormData, key: ChoiceKey) => {
  const v = form[key];
  return Array.isArray(v) ? v.join("، ") : v;
};

/* ---------- انیمیشن‌ها: فقط transform/opacity ---------- */
const spring: Transition = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 };
/* ورود حباب‌ها: فقط opacity + translate — بدون scale، تا بافت لایه
   در طول انیمیشن دوباره raster نشود و روی موبایل کاملاً روان بماند. */
const bubbleIn = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16 } },
  transition: spring,
};
const chipsWrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.06 } },
};
const chipIn = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: spring },
};

type Result = {
  consultation: any;
  matchPercent: number | null;
  product: { id: string; name: string; image: string | null; tagline: string; notes?: string[] } | null;
};

/* ---------- اجزای کوچک ---------- */
function Avatar({ big }: { big?: boolean }) {
  return (
    <span className={big ? "bchat-av" : "bchat-mini"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp" alt="" />
      {big && <i />}
    </span>
  );
}

function Bot({ children, q, hint, cont }: { children: ReactNode; q?: boolean; hint?: string; cont?: boolean }) {
  return (
    <motion.div {...bubbleIn} className={`bchat-row ${cont ? "cont" : ""}`}>
      <Avatar />
      <div className={`bchat-bub ${q ? "q" : ""}`}>
        {children}
        {hint && <small>{hint}</small>}
      </div>
    </motion.div>
  );
}

function Me({ children }: { children: ReactNode }) {
  return (
    <motion.div {...bubbleIn} className="bchat-row me">
      <div className="bchat-bub">{children}</div>
    </motion.div>
  );
}

function Typing() {
  return (
    <motion.div {...bubbleIn} className="bchat-row">
      <Avatar />
      <div className="bchat-typing" aria-label="در حال نوشتن">
        <i />
        <i />
        <i />
      </div>
    </motion.div>
  );
}

function Bottle() {
  return (
    <svg width="54" height="84" viewBox="0 0 54 84" aria-hidden="true">
      <defs>
        <linearGradient id="bchat-bottle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6EDE0" />
          <stop offset=".55" stopColor="#2f7a55" />
          <stop offset="1" stopColor="#0f3a26" />
        </linearGradient>
      </defs>
      <rect x="21" y="2" width="12" height="12" rx="2" fill="#D4AF37" />
      <rect x="24" y="14" width="6" height="6" fill="#b8912c" />
      <rect x="5" y="20" width="44" height="60" rx="12" fill="url(#bchat-bottle)" stroke="#E7D7C1" strokeOpacity=".6" />
      <rect x="17" y="44" width="20" height="16" rx="4" fill="#06120b" stroke="#D4AF37" strokeWidth=".8" />
      <text x="27" y="55" fontSize="6" textAnchor="middle" fill="#D4AF37" fontFamily="serif">
        BELLA
      </text>
    </svg>
  );
}

function ProductPic({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <Bottle />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}

/* ==================================================================== */

export default function BellaConsultation({ inPopup = false }: { icon?: string; inPopup?: boolean }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initialForm);
  const [typing, setTyping] = useState(false);
  const [picked, setPicked] = useState<string | null>(null); // برق کوتاه روی گزینهٔ تک‌انتخابی
  const [phase, setPhase] = useState<"ask" | "sending" | "done" | "error">("ask");
  const [contactLine, setContactLine] = useState("");
  const [phoneErr, setPhoneErr] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  const bodyRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const curQ = step < QUESTIONS.length ? QUESTIONS[step] : null;
  const multiReady = !!curQ?.multi && (form[curQ.key] as string[]).length > 0;

  /* اسکرول نرم به آخرین پیام — فقط داخل جعبهٔ گفت‌وگو */
  const scrollDown = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
  }, []);
  useEffect(() => {
    scrollDown();
    // بعد از پایان انیمیشن ورود حباب‌ها هم یک بار دیگر (ارتفاع نهایی)
    const t = setTimeout(scrollDown, 320);
    return () => clearTimeout(t);
  }, [step, typing, phase, multiReady, scrollDown]);

  const advance = (to: number) => {
    setTyping(true);
    later(() => {
      setTyping(false);
      setStep(to);
    }, 650);
  };

  const chooseSingle = (key: ChoiceKey, value: string) => {
    if (typing || picked) return;
    setPicked(value);
    setForm((f) => ({ ...f, [key]: value }));
    later(() => {
      setPicked(null);
      advance(step + 1);
    }, 220);
  };

  const toggleMulti = (key: MultiKey, value: string) => {
    if (typing) return;
    setForm((f) => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });
  };

  const confirmMulti = () => {
    if (typing) return;
    advance(step + 1);
  };

  const undo = () => {
    if (typing || step === 0 || phase !== "ask") return;
    const prev = QUESTIONS[step - 1];
    if (prev && !prev.multi) setForm((f) => ({ ...f, [prev.key]: "" }));
    setStep(step - 1);
  };

  const restart = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setForm(initialForm);
    setResult(null);
    setError("");
    setPhoneErr("");
    setContactLine("");
    setPicked(null);
    setTyping(false);
    setPhase("ask");
    setStep(0);
  };

  const submit = async (f: FormData) => {
    setPhase("sending");
    setError("");
    const payload = {
      forWhom: f.forWhom,
      gender: f.gender,
      ageRange: f.ageRange,
      occasions: f.occasions,
      image: f.image,
      scentStylesLiked: f.scentStyles,
      mostImportantCriteria: f.criteria,
      desiredEffect: f.effect,
      budget: f.budget,
      name: f.name,
      phone: toEnDigits(f.phone),
      dislikedScents: "",
      favoritePerfumeName: "",
      favoriteReason: [],
      triedPerfumes: "",
      dislikedPerfumes: "",
      goldenSentence: "",
      email: "",
      instagram: "",
    };
    // حداقل زمان «در حال نوشتن» تا حس گفت‌وگو طبیعی باشد.
    const minWait = new Promise((r) => setTimeout(r, 1400));
    try {
      const [res] = await Promise.all([
        fetch("/api/consultations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        minWait,
      ]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "خطا در ارسال پاسخ‌ها");
        setPhase("error");
        return;
      }
      setResult({ consultation: data.consultation, matchPercent: data.matchPercent ?? null, product: data.product ?? null });
      setPhase("done");
    } catch {
      await minWait;
      setError("ارتباط با سرور برقرار نشد");
      setPhase("error");
    }
  };

  const sendContact = (skip: boolean) => {
    if (phase !== "ask" || typing) return;
    let f = form;
    if (skip) {
      f = { ...form, name: "", phone: "" };
      setForm(f);
      setContactLine("ترجیح می‌دهم فعلاً رد شوم");
    } else {
      if (form.phone.trim() && !validPhone(form.phone)) {
        setPhoneErr("شماره موبایل را درست وارد کنید (مثلاً ۰۹۱۲۱۲۳۴۵۶۷)");
        return;
      }
      if (!form.name.trim() && !form.phone.trim()) {
        setPhoneErr("نام یا شماره را بنویسید، یا «رد شدن» را بزنید");
        return;
      }
      setContactLine([form.name.trim(), form.phone.trim()].filter(Boolean).join(" — "));
    }
    setPhoneErr("");
    submit(f);
  };

  const q = step < QUESTIONS.length ? QUESTIONS[step] : null;
  const progressStep = phase === "done" ? TOTAL : Math.min(step + 1, TOTAL);
  const firstName = form.name.trim().split(/\s+/)[0];
  const rec = result?.consultation?.recommendation;
  const productId = result?.product?.id || result?.consultation?.recommendedProductId;

  return (
    <section id="bella-consultation" className={inPopup ? "consult-inner" : "relative py-16 sm:py-24"}>
      <div className="relative mx-auto max-w-3xl px-5">
        {inPopup ? (
          <div className="consult-ttl">
            <b>عطر شما کدام است؟</b>
            <small>کمک می‌کنیم عطری انتخاب کنید که فقط خوشبو نباشد؛ با شخصیت و سبک زندگی شما هماهنگ باشد.</small>
          </div>
        ) : (
          <SectionHeading
            eyebrow="BELLA CONSULTATION"
            title="عطر شما کدام است؟"
            sub="کمک می‌کنیم عطری انتخاب کنید که فقط خوشبو نباشد؛ با شخصیت و سبک زندگی شما هماهنگ باشد."
          />
        )}

        <div className="bchat" dir="rtl">
          <div className="bchat-glow" aria-hidden="true" />

          {/* ---------- سربرگ ---------- */}
          <div className="bchat-hd">
            <Avatar big />
            <div className="min-w-0">
              <b>مشاور عطر بلا</b>
              <small>{typing || phase === "sending" ? "در حال نوشتن…" : "آنلاین · پاسخ در چند ثانیه"}</small>
            </div>
            <div className="bchat-prog">
              <span>{phase === "done" ? "پیشنهاد آماده شد ✓" : `سؤال ${fa(progressStep)} از ${fa(TOTAL)}`}</span>
              <div className="bchat-bar">
                <span style={{ transform: `scaleX(${progressStep / TOTAL})` }} />
              </div>
            </div>
            {(step > 0 || phase !== "ask") && (
              <button type="button" onClick={restart} className="bchat-icon-btn" aria-label="شروع دوباره" title="شروع دوباره">
                <RotateCcw size={15} />
              </button>
            )}
          </div>

          {/* ---------- پیام‌ها ---------- */}
          {/* ارتفاع کل ثابت است؛ نوار پایین از فضای پیام‌ها کم می‌کند تا صفحه هرگز جابه‌جا نشود */}
          <div className="bchat-main">
          <div ref={bodyRef} className="bchat-body" aria-live="polite">
            <AnimatePresence initial={false}>
              <Bot key="hi">سلام! من مشاور عطر بلا هستم.</Bot>
              <Bot key="hi2" cont>
                چند سؤال کوتاه می‌پرسم تا عطری پیدا کنیم که واقعاً «مال شما» باشد.
              </Bot>

              {/* پرسش‌ها و پاسخ‌ها — حباب پرسش ثابت می‌ماند و فقط پاسخ اضافه می‌شود */}
              {QUESTIONS.slice(0, Math.min(step + 1, QUESTIONS.length)).flatMap((qq, i) => {
                const items = [
                  <Bot key={`q-${qq.key}`} q hint={i === step ? qq.hint : undefined}>
                    {qq.lead && <>{qq.lead} </>}
                    {qq.text}
                  </Bot>,
                ];
                if (i < step || (i === step && typing)) items.push(<Me key={`a-${qq.key}`}>{answerText(form, qq.key)}</Me>);
                return items;
              })}

              {q && !typing && (
                <motion.div key={`c-${q.key}`} className="bchat-chips" variants={chipsWrap} initial="hidden" animate="show" exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                  {OPTIONS[q.key].map((opt) => {
                    const val = form[q.key];
                    const on = Array.isArray(val) ? val.includes(opt) : picked === opt || val === opt;
                    const Icon = q.key === "scentStyles" ? SCENT_ICONS[opt] : undefined;
                    return (
                      <motion.button
                        key={opt}
                        type="button"
                        variants={chipIn}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => (q.multi ? toggleMulti(q.key as MultiKey, opt) : chooseSingle(q.key, opt))}
                        className={`bchat-chip ${on ? "on" : ""}`}
                        aria-pressed={on}
                      >
                        {Icon ? <Icon size={14} /> : on && q.multi ? <Check size={13} /> : null}
                        {opt}
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
              {q && !typing && q.multi && (form[q.key] as string[]).length > 0 && (
                <motion.button key={`go-${q.key}`} {...bubbleIn} type="button" onClick={confirmMulti} className="bchat-go">
                  <span>تأیید انتخاب‌ها</span>
                  <ArrowLeft size={14} />
                </motion.button>
              )}

              {/* سؤال دهم: نام و شماره */}
              {step === CONTACT_STEP && !typing && (
                <Bot key="contact-q" hint="اختیاری است؛ می‌توانید رد شوید">
                  آخرین قدم! اسم و شماره‌تان را بنویسید تا نتیجه را برایتان بفرستیم.
                </Bot>
              )}
              {contactLine && phase !== "ask" && <Me key="contact-a">{contactLine}</Me>}
              {(phase === "sending" || phase === "done") && (
                <Bot key="thanks">
                  {firstName ? `ممنون ${firstName} جان! ` : "ممنون! "}دارم پاسخ‌هایتان را با عطرهای بلا مقایسه می‌کنم…
                </Bot>
              )}

              {(typing || phase === "sending") && <Typing key="typing" />}

              {phase === "error" && (
                <motion.div key="err" {...bubbleIn} className="bchat-row">
                  <Avatar />
                  <div className="bchat-bub bchat-err">
                    {error}
                    <button type="button" onClick={() => submit(form)} className="bchat-retry">
                      <RotateCcw size={13} /> تلاش دوباره
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ---------- نتیجه ---------- */}
              {phase === "done" && productId && (
                <Bot key="found" q>
                  پیدا شد! این عطر بیشترین هماهنگی را با سلیقه‌ی شما دارد:
                </Bot>
              )}
              {phase === "done" && productId && (
                <motion.div
                  key="card"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.15 }}
                  className="bchat-res"
                >
                  <div className="bchat-res-top">
                    <div className="bchat-res-pic">
                      <ProductPic src={result?.product?.image ?? null} alt={rec?.productName || ""} />
                    </div>
                    <div className="min-w-0">
                      <h4>{result?.product?.name || rec?.productName}</h4>
                      {result?.product?.tagline && <p>{result.product.tagline}</p>}
                      {typeof result?.matchPercent === "number" && (
                        <span className="bchat-match">
                          <Star size={12} fill="currentColor" /> {fa(result.matchPercent)}٪ هماهنگی با سلیقه‌ی شما
                        </span>
                      )}
                    </div>
                  </div>
                  {!!result?.product?.notes?.length && (
                    <div className="bchat-notes">
                      {result.product.notes.map((n) => (
                        <span key={n}>{n}</span>
                      ))}
                    </div>
                  )}
                  {(rec?.feeling || rec?.bestTime) && (
                    <dl className="bchat-facts">
                      {rec?.feeling && (
                        <div>
                          <dt>حس کلی رایحه</dt>
                          <dd>{rec.feeling}</dd>
                        </div>
                      )}
                      {rec?.bestTime && (
                        <div>
                          <dt>بهترین زمان استفاده</dt>
                          <dd>{rec.bestTime}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  <div className="bchat-acts">
                    <Link href={`/shop/${productId}`} className="a1">
                      مشاهده و خرید
                    </Link>
                    <button type="button" onClick={restart} className="a2">
                      شروع دوباره
                    </button>
                  </div>
                </motion.div>
              )}
              {phase === "done" && rec?.why && (
                <motion.div key="why" {...bubbleIn} transition={{ ...spring, delay: 0.35 }} className="bchat-row">
                  <Avatar />
                  <div className="bchat-bub">{rec.why}</div>
                </motion.div>
              )}
              {phase === "done" && (
                <motion.div key="sim" {...bubbleIn} transition={{ ...spring, delay: 0.5 }} className="bchat-row cont">
                  <Avatar />
                  <div className="bchat-bub">
                    {productId
                      ? rec?.similar?.length > 0
                        ? `گزینه‌های مشابه هم: ${rec.similar.join("، ")}`
                        : "اگر سؤالی دارید، در اینستاگرام هم در خدمتتان هستیم."
                      : "فعلاً عطری دقیقاً با این مشخصات پیدا نکردم؛ پاسخ‌هایتان ثبت شد و مشاوران بلا راهنمایی‌تان می‌کنند."}
                    <a href="https://instagram.com/bella_perfume1985" target="_blank" rel="noopener noreferrer" className="bchat-insta">
                      <Instagram size={13} /> مشاوره در اینستاگرام
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ---------- نوار پایین: برگشت / فرم نام و شماره ---------- */}
          <AnimatePresence initial={false}>
            {step === CONTACT_STEP && phase === "ask" && !typing ? (
              <motion.form
                key="composer"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24, transition: { duration: 0.18 } }}
                transition={spring}
                className="bchat-comp"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendContact(false);
                }}
              >
                <label className="bchat-inp">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.slice(0, 80) }))}
                    placeholder="نام شما"
                    autoComplete="name"
                  />
                </label>
                <label className="bchat-inp">
                  <input
                    value={form.phone}
                    onChange={(e) => {
                      setPhoneErr("");
                      setForm((f) => ({ ...f, phone: e.target.value.slice(0, 20) }));
                    }}
                    placeholder="شماره موبایل"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                  />
                  <button type="submit" className="bchat-send" aria-label="ارسال">
                    <ArrowLeft size={16} strokeWidth={2.4} />
                  </button>
                </label>
                <div className="bchat-comp-foot">
                  <AnimatePresence>
                    {phoneErr && (
                      <motion.span key="pe" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bchat-perr">
                        {phoneErr}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <span className="flex-1" />
                  <button type="button" onClick={undo} className="bchat-link">
                    <Undo2 size={13} /> سؤال قبل
                  </button>
                  <button type="button" onClick={() => sendContact(true)} className="bchat-link">
                    رد شدن
                  </button>
                </div>
              </motion.form>
            ) : step > 0 && phase === "ask" ? (
              <motion.div
                key="undo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                className="bchat-foot"
              >
                <button type="button" onClick={undo} disabled={typing} className="bchat-link">
                  <Undo2 size={13} /> تغییر پاسخ قبلی
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
