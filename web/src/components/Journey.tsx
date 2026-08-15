"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PerfumeBottle, CrestImg, GoldDust } from "./art";
import { useCart } from "./Cart";
import {
  ChevronDown,
  ChevronLeft,
  Sparkles,
  Gift,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { parseJourneyStages, type JourneyStage } from "@/lib/settings";

function useMedia(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mm = window.matchMedia(q);
    const f = () => setM(mm.matches);
    f();
    mm.addEventListener("change", f);
    return () => mm.removeEventListener("change", f);
  }, [q]);
  return m;
}

type Box = { t: string; d: string };
type Stage = {
  key: string;
  rail: string;
  en: string;
  title: string;
  boxes: Box[];
  /** desktop bottle left %, mobile bottle left % */
  dLeft: number;
  mLeft: number;
  scale: number;
  rotate: number;
  textSide: "left" | "right" | "center";
};

const STAGES: Stage[] = [
  {
    key: "top",
    rail: "نت آغازین",
    en: "TOP NOTES / 01",
    title: "نخستین برخورد",
    boxes: [
      { t: "ترنج کالابریا", d: "درخششی مرکباتی که در ثانیه‌ی اول منتشر می‌شود." },
      { t: "زعفران ایرانی", d: "گرمای سرخ و اشرافی، امضای رسمی بلّا." },
      { t: "هل سبز", d: "لمسی ادویه‌ای که رایحه را زنده نگه می‌دارد." },
      { t: "۱۵ دقیقه اول", d: "لحظه‌ای که حضور شما اعلام می‌شود." },
    ],
    dLeft: 28,
    mLeft: 27,
    scale: 0.82,
    rotate: -4,
    textSide: "right",
  },
  {
    key: "heart",
    rail: "نت میانی",
    en: "HEART NOTES / 02",
    title: "قلبِ رایحه",
    boxes: [
      { t: "رز دمشقی", d: "گلِ سلطنتی، برداشت‌شده در سپیده‌دم." },
      { t: "یاس شب‌بو", d: "شیرینی مخملی برای شب‌های خاص." },
      { t: "مریم", d: "عمق سفید و کرمی در بطن عطر." },
      { t: "۴ ساعت میانی", d: "بخشی که شخصیت شما را روایت می‌کند." },
    ],
    dLeft: 72,
    mLeft: 73,
    scale: 0.74,
    rotate: 4,
    textSide: "left",
  },
  {
    key: "base",
    rail: "نت پایه",
    en: "BASE NOTES / 03",
    title: "امضای ماندگار",
    boxes: [
      { t: "عنبر خاکستری", d: "گرمای شرقی که روی پوست می‌نشیند." },
      { t: "مشک سفید", d: "پاکیزگی ابریشمی و بی‌پایان." },
      { t: "چوب صندل", d: "آرامشی چوبی برای ساعت‌های پایانی." },
      { t: "۱۲+ ساعت", d: "ماندگاری روی پوست، روزها روی لباس." },
    ],
    dLeft: 30,
    mLeft: 29,
    scale: 0.66,
    rotate: -3,
    textSide: "right",
  },
  {
    key: "why",
    rail: "چرا بلّا",
    en: "WHY BELLA / 04",
    title: "چرا عطر زدن؟",
    boxes: [
      { t: "اعتمادبه‌نفس", d: "عطر پیش از شما وارد اتاق می‌شود." },
      { t: "حافظه‌ی بویایی", d: "رایحه در عمیق‌ترین لایه‌ی خاطره ثبت می‌شود." },
      { t: "آرامش", d: "نت‌های طبیعی، استرس روزمره را کم می‌کنند." },
      { t: "جذابیت", d: "افراد خوش‌عطر، به‌یادماندنی‌تر دیده می‌شوند." },
    ],
    dLeft: 70,
    mLeft: 71,
    scale: 0.58,
    rotate: 3,
    textSide: "left",
  },
  {
    key: "bag",
    rail: "پاکت مخمل",
    en: "VELVET BAG / 05",
    title: "درون پاکت مخملی",
    boxes: [
      { t: "مخمل زمردی", d: "پارچه‌ی دست‌دوز با بافت شاهانه." },
      { t: "دوخت طلایی", d: "خط‌های ریشه‌دار طلا روی لبه‌ها." },
      { t: "نشان بلّا", d: "لوگوی طلایی مزون بر سینه‌ی پاکت." },
      { t: "آماده‌ی هدیه", d: "بدون نیاز به کادوپیچی اضافه." },
    ],
    dLeft: 50,
    mLeft: 50,
    scale: 0.3,
    rotate: 0,
    textSide: "center",
  },
];

const RAIL = ["خوش‌آمد", ...STAGES.map((s) => s.rail)];

/**
 * The stage texts exactly as they ship. The admin panel edits a copy of this
 * list; leaving the setting empty keeps this default wording and look.
 */
import SiteIcon from "./SiteIcon";

export const DEFAULT_JOURNEY_STAGES: JourneyStage[] = STAGES.map((s) => ({
  t: s.title,
  d: s.boxes.map((b) => `${b.t} | ${b.d}`).join("\n"),
}));

function linesToBoxes(raw: string): Box[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [head, ...rest] = line.split("|");
      return { t: head.trim(), d: rest.join("|").trim() };
    })
    .filter((box) => box.t || box.d);
}

export default function Journey({
  festivalIcon,
  festivalActive = true,
  festivalTitle = "جشنواره خرید اول بلّا",
  festivalSubtitle = "۲۵٪ تخفیف + اتومایزر هدیه",
  journeyStages = "",
  bottleGlass = "#0d3b26",
  bottleLiquid = "#d4af37",
  bottleImage = "",
}: {
  festivalIcon?: string;
  festivalActive?: boolean;
  festivalTitle?: string;
  festivalSubtitle?: string;
  /** JSON list of stage texts coming from the admin settings page. */
  journeyStages?: string;
  bottleGlass?: string;
  bottleLiquid?: string;
  /** Uploaded photo shown instead of the drawn bottle. */
  bottleImage?: string;
} = {}) {
  const [i, setI] = useState(0);
  // BUG FIX: `done` used to reset to false on every return to the home page, so
  // visitors were trapped in the intro animation again and again. The choice is
  // now remembered for the browsing session.
  const [done, setDone] = useState(false);
  const { open: cartOpen } = useCart();

  useEffect(() => {
    try {
      if (sessionStorage.getItem("bella-journey-done") === "1") setDone(true);
    } catch {
      /* private mode / storage disabled */
    }
  }, []);
  const busy = useRef(false);
  const acc = useRef(0);
  const touchY = useRef(0);
  const mobile = useMedia("(max-width: 767px)");

  // Stage texts = defaults, overridden by whatever the admin saved.
  const stages = useMemo(() => {
    const overrides = parseJourneyStages(journeyStages, DEFAULT_JOURNEY_STAGES);
    return STAGES.map((stage, index) => {
      const override = overrides[index];
      if (!override) return stage;
      const boxes = linesToBoxes(override.d);
      return {
        ...stage,
        title: override.t.trim() || stage.title,
        boxes: boxes.length ? boxes : stage.boxes,
      };
    });
  }, [journeyStages]);

  const last = stages.length;

  const go = useCallback(
    (dir: 1 | -1) => {
      if (busy.current) return false;
      const next = i + dir;
      if (next < 0 || next > last) return false;
      busy.current = true;
      setI(next);
      window.setTimeout(() => (busy.current = false), 620);
      return true;
    },
    [i, last],
  );

  const release = useCallback(() => {
    setDone(true);
    try {
      sessionStorage.setItem("bella-journey-done", "1");
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      document.getElementById("after-journey")?.scrollIntoView({ behavior: "smooth" });
    }, 60);
  }, []);

  /* lock page scroll while journey runs */
  useEffect(() => {
    // BUG FIX: the lock also applied while the cart drawer was open, so the
    // cart contents could not be scrolled on the home page.
    if (done || cartOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.scrollTo(0, 0);
    return () => {
      document.body.style.overflow = prev;
    };
  }, [done, cartOpen]);

  /* once the journey has finished and normal page scroll takes over,
     watch for the user scrolling all the way back up to the top —
     when they do, re-lock the page and resume the gesture handling so
     scrolling up keeps walking the story backwards to the first stage */
  const scrolledAwayRef = useRef(false);
  useEffect(() => {
    if (!done) {
      scrolledAwayRef.current = false;
      return;
    }
    const onScroll = () => {
      if (window.scrollY > 40) {
        scrolledAwayRef.current = true;
      } else if (window.scrollY <= 2 && scrolledAwayRef.current) {
        setDone(false);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [done]);

  /* gesture handling — one small scroll plays a whole stage */
  useEffect(() => {
    // BUG FIX: these listeners call preventDefault() on the WINDOW, which also
    // swallowed scrolling inside the open cart drawer.
    if (done || cartOpen) return;
    const step = (dir: 1 | -1) => {
      if (dir === 1 && i === last) return release();
      go(dir);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (busy.current) return;
      acc.current += e.deltaY;
      if (Math.abs(acc.current) > 26) {
        step(acc.current > 0 ? 1 : -1);
        acc.current = 0;
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (busy.current) return;
      const dy = touchY.current - e.touches[0].clientY;
      if (Math.abs(dy) > 30) {
        step(dy > 0 ? 1 : -1);
        touchY.current = e.touches[0].clientY;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        step(1);
      }
      if (["ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [i, last, go, done, release]);

  const stage = i > 0 ? stages[i - 1] : null;
  const inBag = i === last;

  /* animated bottle position — shifts side every stage */
  const bLeft = stage ? (mobile ? stage.mLeft : stage.dLeft) : 50;
  const bTop = stage ? (inBag ? 50 : mobile ? 34 : 46) : 46;
  const bScale = stage ? stage.scale : 0.9;
  const bRot = stage ? stage.rotate : 0;
  /* the bottle starts completely empty on the hero (before any scroll),
     becomes half-full the instant the first scroll fires (stage 1), then
     fills further with each following stage, reaching completely full
     exactly when it settles into the velvet bag at the last stage */
  const fillLevel = i === 0 ? 0 : 0.5 + ((i - 1) / (last - 1)) * 0.5;

  /* a little perfume "puff" bursts from the leading tip of the bottle
     every time it travels sideways to a new stage */
  const prevLeft = useRef(bLeft);
  const [puff, setPuff] = useState<{ key: number; side: "left" | "right" } | null>(null);
  useEffect(() => {
    if (!stage || inBag) {
      prevLeft.current = bLeft;
      return;
    }
    if (bLeft !== prevLeft.current) {
      const side = bLeft > prevLeft.current ? "right" : "left";
      setPuff({ key: Date.now(), side });
      prevLeft.current = bLeft;
    }
  }, [bLeft, stage, inBag]);

  const replay = () => {
    setDone(false);
    setI(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section id="experience" className="relative h-[100svh] w-full overflow-hidden">
      {/* ambient */}
      <div className="vignette absolute inset-0" />
      <div className="absolute top-1/3 left-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pine/35 blur-[100px]" />
      <GoldDust count={20} />

      {/* progress */}
      <div className="absolute top-0 right-0 left-0 z-30 h-[3px] bg-white/5">
        <motion.div
          className="h-full bg-gradient-to-l from-gold-deep via-gold to-gold-soft"
          style={{ transformOrigin: "right" }}
          animate={{ scaleX: i / last }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* rail */}
      <div className="absolute top-1/2 left-2 z-30 flex -translate-y-1/2 flex-col items-center gap-3 lg:left-6">
        {RAIL.map((s, k) => (
          <button
            key={s}
            onClick={() => !busy.current && setI(k)}
            className="group flex items-center gap-2"
            aria-label={s}
          >
            <span
              className={`h-2 w-2 rounded-full border transition-all duration-500 ${
                i === k
                  ? "scale-150 border-gold bg-gold shadow-[0_0_10px_rgba(212,175,55,0.9)]"
                  : "border-gold/40"
              }`}
            />
            <span
              className={`hidden text-[10px] transition-opacity duration-500 lg:block ${
                i === k ? "text-gold-soft opacity-100" : "opacity-0"
              }`}
            >
              {s}
            </span>
          </button>
        ))}
      </div>

      {/* ---------------- HERO ---------------- */}
      <AnimatePresence>
        {i === 0 && (
          <motion.div
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center px-5 pt-16 pb-24 text-center"
          >
            <motion.div
              initial={{ opacity: 0, y: -160 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <CrestImg className="w-32 rounded-xl sm:w-48 md:w-56" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: -140, scale: 0.12, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 1.4, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="font-brand mt-1 leading-none text-gold"
              style={{ fontSize: "clamp(2.75rem, 13vw, 5.25rem)" }}
            >
              Bella Perfume
            </motion.h1>
            <p className="mt-3 max-w-xs text-[13px] leading-6 text-cream/90 sm:max-w-md sm:text-base">
              افسونگری لوکس در قالب یک شیشه کریستال تراش‌خورده
            </p>

            <motion.div
              initial={{ opacity: 0, x: -170 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 0.95, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                href="/shop"
                className="shimmer-btn mt-6 flex items-center gap-2 rounded-full px-6 py-3 text-[13px] font-bold text-[#241a05] shadow-[0_8px_30px_rgba(212,175,55,0.35)] active:scale-95 sm:px-8"
              >
                <Sparkles size={15} />
                مشاهده و خرید محصولات
              </Link>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 170 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 1.0, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                onClick={() => go(1)}
                className="mt-3 rounded-full border border-gold/35 bg-black/20 px-6 py-2.5 text-[12px] text-gold-soft active:scale-95"
              >
                شروع تجربه لوکس بلّا ←
              </button>
            </motion.div>

            {festivalActive && (
              <motion.div
                initial={{ opacity: 0, y: 46, scale: 0.8 }}
                animate={{ opacity: 1, y: [46, -6, 0], scale: [0.8, 1.05, 1] }}
                transition={{ duration: 0.85, delay: 1.15, ease: [0.22, 1, 0.36, 1] }}
                className="relative mt-6 w-full max-w-sm"
              >
                {/* burst flash behind the card */}
                <motion.span
                  aria-hidden
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: [0, 0.9, 0], scale: [0, 1.5, 2.1] }}
                  transition={{ duration: 0.8, delay: 1.15, ease: "easeOut" }}
                  className="pointer-events-none absolute inset-0 rounded-full bg-gold/40 blur-2xl"
                />
                {/* small sparks flying outward */}
                {[
                  { x: -46, y: -22 },
                  { x: 40, y: -26 },
                  { x: -30, y: 20 },
                  { x: 44, y: 18 },
                ].map((p, idx) => (
                  <motion.span
                    key={idx}
                    aria-hidden
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                    animate={{ opacity: [0, 1, 0], x: p.x, y: p.y, scale: [0, 1, 0.4] }}
                    transition={{ duration: 0.7, delay: 1.2 + idx * 0.03, ease: "easeOut" }}
                    className="pointer-events-none absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.9)]"
                  />
                ))}

                {/* Breathing halo so the banner keeps pulling the eye after
                    the entrance animation is over. */}
                <motion.span
                  aria-hidden
                  animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.97, 1.04, 0.97] }}
                  transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
                  className="pointer-events-none absolute -inset-2 rounded-[28px] bg-gold/25 blur-2xl"
                />

                <div className="festival-banner glass-card gold-ring relative w-full overflow-hidden rounded-2xl px-4 py-3.5 text-right">
                  {/* light sweeping across the glass */}
                  <span aria-hidden className="festival-sheen pointer-events-none absolute inset-0" />

                  <div className="relative flex items-center gap-3">
                    <motion.span
                      animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.12, 1] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold/45 bg-gradient-to-br from-gold/35 to-gold/5 text-gold shadow-[0_0_18px_rgba(212,175,55,0.35)]"
                    >
                      <SiteIcon name={festivalIcon} fallback="gift" size={19} />
                    </motion.span>

                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[9px] font-black tracking-widest text-gold">
                        <Sparkles size={9} /> جشنواره
                      </span>
                      <p className="gold-text mt-1 truncate text-[13.5px] font-black sm:text-[15px]">
                        {festivalTitle}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-cream/85">
                        {festivalSubtitle}
                      </p>
                    </div>

                    <Link
                      href="/shop"
                      className="shimmer-btn flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-[11px] font-black text-[#241a05] shadow-[0_6px_20px_rgba(212,175,55,0.4)] active:scale-95"
                    >
                      دیدن تخفیف‌ها
                      <ChevronLeft size={13} />
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- BOTTLE (moves side-to-side each stage) ---------------- */}
      <motion.div
        className="absolute top-0 left-0 z-10"
        animate={{
          left: `${bLeft}%`,
          top: `${bTop}%`,
          scale: bScale,
          rotate: bRot,
          x: "-50%",
          y: "-50%",
          opacity: i === 0 ? 0 : 1,
        }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="animate-glowpulse absolute top-1/2 left-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/25 blur-[60px]"
          animate={{ opacity: inBag ? 0 : 0.9 }}
        />
        {bottleImage ? (
          // A photo uploaded in the admin panel wins over the drawn bottle.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bottleImage}
            alt="عطر بلّا"
            className="animate-bob relative w-36 object-contain drop-shadow-[0_22px_45px_rgba(0,0,0,0.7)] sm:w-48"
          />
        ) : (
          <PerfumeBottle
            className="animate-bob relative w-36 drop-shadow-[0_22px_45px_rgba(0,0,0,0.7)] sm:w-48"
            fillLevel={fillLevel}
            glass={bottleGlass}
            liquid={bottleLiquid}
            showCrest
          />
        )}

        {/* perfume "puff" — bursts from the leading tip whenever the bottle changes direction */}
        {puff && (
          <motion.div
            key={puff.key}
            className={`pointer-events-none absolute top-[16%] z-20 ${
              puff.side === "left" ? "left-0" : "right-0"
            }`}
            style={{ transform: puff.side === "left" ? "translate(-35%, -50%)" : "translate(35%, -50%)" }}
          >
            <motion.span
              initial={{ opacity: 0.85, scale: 0 }}
              animate={{ opacity: 0, scale: 2.4 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="absolute top-0 left-0 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cream/70 blur-md"
            />
            {[0, 1, 2].map((n) => (
              <motion.span
                key={n}
                initial={{ opacity: 0.9, x: 0, y: 0, scale: 0.6 }}
                animate={{
                  opacity: 0,
                  x: (puff.side === "left" ? -1 : 1) * (16 + n * 9),
                  y: -8 - n * 5,
                  scale: 0.2,
                }}
                transition={{ duration: 0.55 + n * 0.08, delay: n * 0.03, ease: "easeOut" }}
                className="absolute top-0 left-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-soft shadow-[0_0_6px_rgba(232,205,133,0.9)]"
              />
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* ---------------- VELVET BAG with crest medallion ---------------- */}
      <AnimatePresence>
        {inBag && (
          <motion.div
            key="bag"
            initial={{ opacity: 0, scale: 0.7, y: 60 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 40 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-[44%]"
          >
            <div className="absolute top-1/2 left-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/15 blur-[55px]" />
            <svg viewBox="0 0 280 260" className="relative w-52 sm:w-64" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="jvelvet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a4a31" />
                  <stop offset="60%" stopColor="#0d2b1b" />
                  <stop offset="100%" stopColor="#06170e" />
                </linearGradient>
                <linearGradient id="jgold" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#8a6d22" />
                  <stop offset="50%" stopColor="#f0d68c" />
                  <stop offset="100%" stopColor="#8a6d22" />
                </linearGradient>
              </defs>

              <motion.path
                d="M96 80 C96 22 184 22 184 80"
                stroke="url(#jgold)"
                strokeWidth="9"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, delay: 0.75 }}
              />
              <motion.path
                d="M62 80 L218 80 L203 228 L77 228 Z"
                fill="url(#jvelvet)"
                stroke="#d4af37"
                strokeWidth="3"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9 }}
              />
              <motion.path
                d="M73 90 L207 90 L194 218 L86 218 Z"
                stroke="#e8cd85"
                strokeWidth="1.3"
                strokeDasharray="5 6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 1.05 }}
              />
              <motion.line
                x1="140" y1="158" x2="206" y2="158"
                stroke="url(#jgold)" strokeWidth="8" strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 1.15 }}
              />
              <motion.line
                x1="140" y1="158" x2="74" y2="158"
                stroke="url(#jgold)" strokeWidth="8" strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 1.2 }}
              />

              {/* crest medallion instead of the yellow circle */}
              <motion.g
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{ originX: "140px", originY: "158px" }}
                transition={{ type: "spring", damping: 11, delay: 1.5 }}
              >
                <circle cx="140" cy="158" r="17" fill="#06170e" stroke="#f0d68c" strokeWidth="2" />
                <image href="/crest.webp" x="123" y="141" width="34" height="34" preserveAspectRatio="xMidYMid meet" />
              </motion.g>

              <rect x="126" y="222" width="28" height="9" rx="4.5" fill="url(#jgold)" />
            </svg>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.7 }}
              className="absolute inset-0"
            >
              {["top-1 right-4", "top-8 left-1", "bottom-6 right-0", "bottom-1 left-8"].map((pos, k) => (
                <svg
                  key={pos}
                  viewBox="0 0 20 20"
                  className={`absolute h-4 w-4 text-gold-soft ${pos}`}
                  style={{ animation: `glowpulse 2.${k + 2}s ease-in-out infinite` }}
                >
                  <path d="M10 0l2.4 7.6L20 10l-7.6 2.4L10 20l-2.4-7.6L0 10l7.6-2.4z" fill="currentColor" />
                </svg>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- TITLE + 4 BOXES (side flips each stage) ---------------- */}
      <AnimatePresence mode="wait">
        {stage && (
          <motion.div
            key={stage.key}
            initial={{ opacity: 0, x: stage.textSide === "left" ? 60 : stage.textSide === "right" ? -60 : 0, y: stage.textSide === "center" ? 40 : 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: stage.textSide === "left" ? -40 : stage.textSide === "right" ? 40 : 0, y: stage.textSide === "center" ? 20 : 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute z-20 inset-x-0 bottom-20 px-4 md:inset-x-auto md:bottom-auto md:top-1/2 md:w-[38%] md:-translate-y-1/2 md:px-0 ${
              stage.textSide === "left"
                ? "md:left-[6%]"
                : stage.textSide === "right"
                  ? "md:right-[6%]"
                  : "md:left-1/2 md:-translate-x-1/2"
            }`}
          >
            <div className={`mb-3 text-center ${stage.textSide === "left" ? "md:text-left" : stage.textSide === "right" ? "md:text-right" : ""}`}>
              <p className="font-display text-[10px] font-semibold tracking-[0.4em] text-gold">{stage.en}</p>
              <h2 className="mt-1 text-lg font-black text-cream sm:text-2xl md:text-3xl">{stage.title}</h2>
            </div>

            <div className="mx-auto grid max-w-md grid-cols-2 gap-2 sm:gap-3 md:max-w-none">
              {stage.boxes.map((bx, k) => {
                const fromTop = k < 2; // top row (0,1) drops from above, bottom row (2,3) rises from below
                const settleAt = 0.15 + k * 0.11 + 0.5; // matches this box's own entrance duration
                return (
                  <motion.div
                    key={bx.t}
                    initial={{ opacity: 0, y: fromTop ? -46 : 46, scale: 0.9, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.5, delay: 0.15 + k * 0.11, ease: [0.22, 1, 0.36, 1] }}
                    className="glass-card glow-border rounded-xl px-3 py-2.5 sm:px-4 sm:py-3"
                    style={{ animationDelay: `${settleAt}s` }}
                  >
                    <p className="flex items-center gap-1.5 text-[11px] font-black text-gold-soft sm:text-[13px]">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-gold" />
                      {bx.t}
                    </p>
                    <p className="mt-1 text-[10px] leading-[1.7] text-sage sm:text-[11.5px]">{bx.d}</p>
                    <span className="mt-1.5 block text-[8px] tracking-widest text-gold/40">0{k + 1}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- HINT / NEXT ---------------- */}
      <div className="absolute right-0 bottom-5 left-0 z-20 flex flex-col items-center gap-1 text-gold-soft">
        {i === last ? (
          <button
            onClick={release}
            className="shimmer-btn flex items-center gap-2 rounded-full px-6 py-2.5 text-[12px] font-bold text-[#241a05] active:scale-95"
          >
            مشاهده برندها و پرفروش‌ها
            <ArrowLeft size={14} />
          </button>
        ) : (
          <button onClick={() => go(1)} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] tracking-widest">
              {i === 0 ? "کمی اسکرول کنید" : `مرحله ${i} از ${last}`}
            </span>
            <ChevronDown size={16} className="animate-bounce" />
          </button>
        )}
      </div>

      {done && (
        <button
          onClick={replay}
          className="absolute top-20 left-3 z-30 flex items-center gap-1.5 rounded-full border border-gold/35 bg-black/40 px-3 py-1.5 text-[10px] text-gold-soft"
        >
          <RotateCcw size={12} /> پخش دوباره
        </button>
      )}
    </section>
  );
}
