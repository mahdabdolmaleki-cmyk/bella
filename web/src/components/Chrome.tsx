"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home,
  Store,
  ShoppingBag,
  Phone,
  User,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
  GraduationCap,
} from "lucide-react";
import Image from "next/image";
import { parseFooterBadges, parseGuarantees } from "@/lib/settings";
import { DEFAULT_SOCIALS, socialColor, type SocialLink } from "@/lib/socials";
import SocialGlyph from "./SocialGlyph";
import { Field, TextField } from "./Field";
import { CrestImg, LogoImg } from "./art";
import { Reveal, SectionHeading } from "./ui";
import { useCart } from "./Cart";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "خانه", icon: Home },
  { href: "/shop", label: "فروشگاه", icon: Store },
  { href: "/learn", label: "آموزش", icon: GraduationCap },
  { href: "cart", label: "سبد خرید", icon: ShoppingBag },
  { href: "/contact", label: "تماس با ما", icon: Phone },
  { href: "/account", label: "پروفایل", icon: User },
];

/* ---------------- Header ---------------- */
export function Header() {
  const { count, setOpen } = useCart();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 right-0 left-0 z-50 transition-all duration-500 ${
        scrolled ? "border-b border-gold/15 glass-bar" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:px-5 sm:py-3.5">
        <motion.div
          initial={{ x: 90, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link href="/" className="flex min-w-0 flex-col items-center gap-0.5 text-center">
            <CrestImg className="w-8 shrink-0 sm:w-10 md:w-11" />
            <motion.span
              initial={{ opacity: 0, scale: 0.15, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 1, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="font-brand block truncate text-lg leading-none text-gold sm:text-2xl md:text-3xl"
            >
              Bella Perfume
            </motion.span>
          </Link>
        </motion.div>

        <motion.button
          initial={{ x: -90, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.85, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          onClick={() => setOpen(true)}
          className="gold-ring relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 glass-soft text-gold active:scale-95 sm:h-11 sm:w-11"
          aria-label="سبد خرید"
        >
          <ShoppingBag size={16} />
          <AnimatePresence>
            {count > 0 && (
              <motion.span
                key={count}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-black text-[#241a05]"
              >
                {count.toLocaleString("fa-IR")}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.header>
  );
}

/* ---------------- Bottom Nav ---------------- */
export function BottomNav() {
  const { count, setOpen } = useCart();
  const path = usePathname();

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 border-t border-gold/20 glass-bar pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-stretch justify-between px-1.5 py-1">
        {NAV.map((it) => {
          const isRoute = it.href.startsWith("/");
          const isActive = isRoute && path === it.href;
          const cls = `relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 transition-colors ${
            isActive ? "text-gold" : "text-sage active:text-gold-soft"
          }`;
          const inner = (
            <>
              <span className="relative">
                <it.icon size={18} strokeWidth={isActive ? 2.4 : 1.8} />
                {it.href === "cart" && count > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-black text-[#241a05]">
                    {count.toLocaleString("fa-IR")}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-bold">{it.label}</span>
              {isActive && (
                <motion.span layoutId="navdot" className="absolute top-0 h-1 w-1 rounded-full bg-gold" />
              )}
            </>
          );
          return isRoute ? (
            <Link key={it.href} href={it.href} className={cls}>
              {inner}
            </Link>
          ) : (
            <button
              key={it.href}
              onClick={() => setOpen(true)}
              className={cls}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------------- Contact ---------------- */
// یادداشت v31: آیکن‌ها و لیست ثابت شبکه‌های اجتماعی از اینجا حذف شدند؛
// حالا در lib/socials.ts و components/SocialGlyph.tsx زندگی می‌کنند تا مدیر
// بتواند از پنل کانال اضافه/حذف کند.
/**
 * بخش تماس — از v31 کاملاً قابل تنظیم توسط مدیر است.
 *
 * همهٔ prop ها اختیاری‌اند و مقدار پیش‌فرض دارند؛ بنابراین صفحهٔ اصلی که
 * بدون پارامتر صدایش می‌کند هیچ تغییری نمی‌کند و فقط صفحهٔ /contact
 * مقادیر ذخیره‌شدهٔ تنظیمات را پاس می‌دهد.
 */
export function ContactSection({
  heading = true,
  intro = "بلا را در شبکه‌های اجتماعی دنبال کنید",
  socials = DEFAULT_SOCIALS,
  phone = "۰۲۱ – ۲۲ ۴۴ ۶۶ ۸۸",
  address = "تهران، خیابان فرشته، پاساژ رویال، واحد ۱۲",
  hours = "هر روز ۱۰ صبح تا ۱۰ شب",
}: {
  heading?: boolean;
  intro?: string;
  socials?: SocialLink[];
  phone?: string;
  address?: string;
  hours?: string;
} = {}) {
  const [form, setForm] = useState({ name: "", phone: "", body: "" });
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");

  const [errMsg, setErrMsg] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "busy") return;

    const name = form.name.trim();
    const phone = form.phone.trim();
    const body = form.body.trim();

    if (!name || !phone || body.length < 3) {
      setErrMsg("لطفاً همه‌ی فیلدها را کامل کنید.");
      setState("err");
      return;
    }

    setState("busy");
    setErrMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, body: body.slice(0, 2000) }),
      });

      if (res.ok) {
        setState("done");
        setForm({ name: "", phone: "", body: "" });
        return;
      }

      const data = await res.json().catch(() => null);
      setErrMsg(
        res.status === 429
          ? "پیام‌های زیادی ارسال کرده‌اید. کمی بع�� تلاش کنید."
          : data?.error ?? "ارسال پیام ناموفق بود.",
      );
      setState("err");
    } catch {
      // BUG FIX: an offline/failed fetch threw and left the form stuck on "busy".
      setErrMsg("ارتباط با سرور برقرار نشد.");
      setState("err");
    }
  };

  return (
    <section
      // v32: در صفحهٔ /contact که PageHero خودش سرتیتر دارد، پدینگ بالای این بخش
      // یک فضای خالی بزرگ می‌ساخت؛ حالا جمع می‌شود.
      className={heading ? "relative py-14 sm:py-20" : "relative pb-14 pt-4 sm:pb-20 sm:pt-6"}
      id="contact"
    >
      <div className="mx-auto max-w-5xl px-5">
        {heading && (
          <SectionHeading
            eyebrow="CONTACT"
            title="با مزون بلا در تماس باشید"
            sub="مشاوران رایحه‌ی ما آماده‌اند تا عطر اختصاصی شما را پیدا کنند."
          />
        )}

        {/* social channels — متن و ردیف هر دو از پنل مدیر می‌آیند */}
        {(intro.trim() || socials.length > 0) && (
          <Reveal delay={0.08} className={heading ? "mt-10" : "mt-2"}>
            {/* v32: متن مدیر دیگر یک خط ریز نیست؛ در کارت شیشه‌ای وسط صفحه می‌نشیند
                تا همان فضای خالی بالای شبکه‌ها پر شود. */}
            {intro.trim() && (
              <div className="mx-auto max-w-3xl rounded-3xl glass-panel px-6 py-6 text-center sm:px-10 sm:py-8">
                <p className="whitespace-pre-line text-[13.5px] leading-9 font-bold text-cream sm:text-[15px]">
                  {intro}
                </p>
              </div>
            )}
            <div className="mt-7 flex flex-wrap items-stretch justify-center gap-3 sm:gap-4">
              {socials.map((sc, i) => {
                const colour = socialColor(sc);
                return (
                  <a
                    key={`${sc.name}-${i}`}
                    href={sc.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ["--sc" as string]: colour }}
                    className="group flex min-w-[104px] max-w-[180px] flex-1 flex-col items-center gap-2.5 rounded-2xl border border-white/10 glass-soft px-4 py-4 transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--sc)] hover:shadow-[0_14px_34px_rgba(0,0,0,0.45)] sm:px-6"
                  >
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full text-white transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6"
                      style={{ backgroundColor: colour }}
                    >
                      <SocialGlyph icon={sc.icon} />
                    </span>
                    <span className="text-[12px] font-black text-cream">{sc.name}</span>
                    <span className="flex items-center gap-1 text-[9.5px] text-sage">
                      ورود به کانال
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-hover:-translate-x-0.5">
                        <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </a>
                );
              })}
            </div>
          </Reveal>
        )}

        <div className="mt-10 grid gap-8 md:grid-cols-5">
          <Reveal className="md:col-span-2">
            <div className="space-y-4">
              {[
                { icon: Phone, t: "تلفن مشاوره", d: phone },
                { icon: MapPin, t: "بوتیک اصلی", d: address },
                { icon: Clock, t: "ساعات پاسخگویی", d: hours },
              ]
                .filter((c) => c.d.trim())
                .map((c) => (
                <div
                  key={c.t}
                  className="flex items-center gap-4 rounded-2xl glass-panel p-4 transition-colors hover:border-gold/40"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
                    <c.icon size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] text-sage">{c.t}</p>
                    <p className="mt-0.5 text-sm font-bold text-cream">{c.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.12} className="md:col-span-3">
            <form
              onSubmit={submit}
              className="gold-ring h-full rounded-3xl border border-gold/20 bg-gradient-to-b from-forest/70 to-night p-7"
            >
              {state === "done" ? (
                <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                  <CheckCircle2 size={44} className="text-gold" />
                  <h3 className="mt-4 text-lg font-black text-cream">پیام شما دریافت شد</h3>
                  <p className="mt-2 text-sm text-sage">به‌زودی یکی از مشاوران بلا با شما تماس می‌گیرد.</p>
                  <button
                    type="button"
                    onClick={() => setState("idle")}
                    className="mt-6 rounded-full border border-gold/40 px-6 py-2.5 text-xs font-bold text-gold-soft hover:bg-gold/10"
                  >
                    ارسال پیام جدید
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="نام شما"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      autoComplete="name"
                      icon={<User size={15} />}
                    />
                    <Field
                      label="شماره تماس"
                      required
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      autoComplete="tel"
                      icon={<Phone size={15} />}
                    />
                  </div>
                  <TextField
                    label="پیام شما"
                    required
                    rows={5}
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="مثلاً به دنبال عطری برای هدیه عروسی هستم…"
                    wrapperClassName="mt-4"
                  />
                  {state === "err" && (
                    <p className="mt-2 text-xs text-red-400">
                      {errMsg || "خطا در ارسال، دوباره تلاش کنید."}
                    </p>
                  )}
                  <button
                    disabled={state === "busy"}
                    className="shimmer-btn mt-5 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold text-[#241a05] transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-60"
                  >
                    <Send size={15} />
                    {state === "busy" ? "در حال ارسال..." : "ارسال پیام"}
                  </button>
                </>
              )}
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */
export function Footer({
  aboutText,
  badges: badgesRaw,
  guaranteeTitle = "ضمانت‌های بلا",
  guarantees: guaranteesRaw,
}: {
  aboutText?: string;
  /** JSON list of trust badges, edited in پنل مدیریت ← تنظیمات ← فوتر و نمادها. */
  badges?: string;
  /** عنوان ستون ضمانت‌ها (v33). */
  guaranteeTitle?: string;
  /** متن چندخطی ضمانت‌ها؛ هر خط یک ردیف. */
  guarantees?: string;
}) {
  const badges = parseFooterBadges(badgesRaw);
  const guarantees = parseGuarantees(guaranteesRaw);
  return (
    <footer className="relative border-t border-gold/15 bg-night pb-24">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <LogoImg className="w-32" />
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="font-brand -mt-1 text-3xl leading-none text-gold"
          >
            Bella Perfume
          </motion.p>
          <p className="mt-3 max-w-xs text-xs leading-6 text-sage">
            {aboutText ||
              "مزون بلا از سال ۱۳۹۸ با الهام از عطرسازی کلاسیک فرانسوی و اسانس‌های شرقی، رایحه‌هایی ماندگار برای سلیقه‌های خاص می‌آفریند."}
          </p>
        </div>
        <div className="text-sm">
          <h4 className="mb-4 text-xs font-black tracking-widest text-gold">دسترسی سریع</h4>
          <ul className="space-y-2.5 text-xs text-sage">
            {[
              ["تجربه لوکس بلا", "/"],
              ["کلکسیون عطرها", "/shop"],
              ["آکادمی بلا", "/learn"],
              ["تماس با ما", "/contact"],
            ].map(([l, href]) => (
              <li key={href}>
                <Link href={href} className="transition-colors hover:text-gold">
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {/* v33: این ستون دیگر در کد ثابت نیست — عنوان و ردیف‌هایش از
            پنل مدیریت ← تنظیمات ← فوتر و نمادها می‌آید. هر دو خالی = ستون حذف. */}
        {(guaranteeTitle.trim() || guarantees.length > 0) && (
          <div className="text-xs text-sage">
            {guaranteeTitle.trim() && (
              <h4 className="mb-4 text-xs font-black tracking-widest text-gold">
                {guaranteeTitle}
              </h4>
            )}
            <ul className="space-y-2.5 leading-6">
              {guarantees.map((line, i) => (
                <li key={i}>◆ {line}</li>
              ))}
            </ul>
          </div>
        )}

        {/* نمادها و مجوزها — یک ستون از همین شبکه، نه یک بخش جدا زیر فوتر.
            وقتی هیچ نمادی ثبت نشده باشد ستون اصلاً رندر نمی‌شود و سه ستون
            دیگر فضا را پر می‌کنند، پس جای خالی نمی‌ماند. */}
        {badges.length > 0 && (
          <div className="text-xs text-sage">
            <h4 className="mb-4 text-xs font-black tracking-widest text-gold">نمادها و مجوزها</h4>
            <ul className="flex flex-wrap items-start gap-2.5">
              {badges.map((badge, i) => {
                const art = (
                  <span className="relative block h-[62px] w-[62px] overflow-hidden rounded-lg bg-white/90 p-1">
                    <Image
                      src={badge.image}
                      alt={badge.title || "نماد اعتماد"}
                      fill
                      sizes="72px"
                      className="object-contain p-1"
                      unoptimized
                    />
                  </span>
                );
                return (
                  <li key={`${badge.image}-${i}`} className="w-[74px]">
                    {badge.link ? (
                      <a
                        href={badge.link}
                        target="_blank"
                        // noopener/noreferrer: the badge issuer's page must not
                        // get a window.opener handle back into the shop.
                        rel="noopener noreferrer"
                        title={badge.title || "مشاهده گواهی"}
                        className="glass-soft block rounded-xl border border-gold/20 p-1.5 transition-transform hover:-translate-y-1 hover:border-gold/45"
                      >
                        {art}
                      </a>
                    ) : (
                      <span
                        title={badge.title}
                        className="glass-soft block rounded-xl border border-gold/20 p-1.5"
                      >
                        {art}
                      </span>
                    )}
                    {badge.title && (
                      <span className="mt-1.5 block text-center text-[9.5px] leading-4 text-sage/80">
                        {badge.title}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="hairline mx-auto h-px max-w-6xl" />
      <p className="mt-6 text-center text-[11px] text-sage/70">
        © {new Date().toLocaleDateString("fa-IR", { year: "numeric" })} بلا پرفیوم — تمامی حقوق محفوظ است.
      </p>
    </footer>
  );
}
