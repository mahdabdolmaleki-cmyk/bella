"use client";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  User as UserIcon,
  LogIn,
  LogOut,
  Loader2,
  Package,
  Check,
  Mail,
  MessageSquare,
  Heart,
  Gem,
  LayoutGrid,
  Settings2,
  Trash2,
  Sparkles,
  Clock,
  PackageCheck,
  Truck,
  ShieldCheck,
  XCircle,
  CreditCard,
  MapPin,
  ChevronDown,
  Copy,
  AtSign,
  Smartphone,
  UserRound,
  Hash,
} from "lucide-react";
import { Field, SelectField, TextField } from "@/components/Field";
import {
  useAuth,
  type IdentityField,
  type OtpChannel,
} from "@/components/AuthContext";
import PageHero from "@/components/PageHero";
import { ProductVisual } from "@/components/art";
import { formatToman, toFa, type ProductDTO } from "@/lib/data";
import type { LoyaltyInfo, Order, TierInfo } from "@/lib/types";

export default function AccountPage() {
  const { user, loading } = useAuth();
  // Signed-in visitors get a warm greeting; guests get the sign-in wording.
  const firstName = (user?.name || "").trim().split(/\s+/)[0];

  return (
    <>
      <PageHero
        eyebrow="MON COMPTE"
        title={user ? `خوش آمدید، ${firstName || user.name}` : "حساب کاربری"}
        sub={
          user
            ? "پنل شخصی شما در بلّا — باشگاه مشتریان، سفارش‌ها، علاقه‌مندی‌ها و تنظیمات حساب."
            : "ورود، ثبت‌نام و پیگیری سفارش‌های بلّا."
        }
      />
      <section className={`mx-auto px-4 pb-24 sm:px-5 ${user ? "max-w-5xl" : "max-w-2xl"}`}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sage">
            <Loader2 size={18} className="animate-spin" /> در حال بارگذاری…
          </div>
        ) : user ? (
          <Profile />
        ) : (
          <AuthForms />
        )}
      </section>
    </>
  );
}

/* ------------------------------ Auth forms ------------------------------ */
// ورود فقط با کد یک‌بارمصرف است؛ نه رمزی، نه ثبت‌نام جدا، نه فراموشی رمز.
// همین یک فرم هم برای مشتری و هم برای مدیر اصلی کار می‌کند: اگر شمارهٔ
// واردشده همان شمارهٔ هاردکدشدهٔ مدیر باشد، سرور نشست مدیر می‌سازد و
// این صفحه کاربر را به پنل /admin می‌فرستد.

const PHONE_RE = /^09\d{9}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;

function normalizePhone(input: string) {
  const latin = input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s()\-]/g, "");
  if (latin.startsWith("+98")) return "0" + latin.slice(3);
  if (latin.startsWith("0098")) return "0" + latin.slice(4);
  if (latin.startsWith("98") && latin.length === 12) return "0" + latin.slice(2);
  if (latin.startsWith("9") && latin.length === 10) return "0" + latin;
  return latin;
}

function AuthForms() {
  const { login, requestOtp, verifyOtp } = useAuth();
  const router = useRouter();
  const [channel, setChannel] = useState<OtpChannel>("sms");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resetToForm = () => {
    setStep("form");
    setCode("");
    setDevCode("");
    setError("");
    setNotice("");
  };

  const byEmail = channel === "email";

  const sendCode = async () => {
    const normalizedPhone = normalizePhone(phone);
    const trimmedEmail = email.trim();
    if (byEmail) {
      if (!EMAIL_RE.test(trimmedEmail)) {
        setError("ایمیل را درست وارد کنید.");
        return;
      }
    } else if (!PHONE_RE.test(normalizedPhone)) {
      setError("شماره موبایل را به صورت 09xxxxxxxxx وارد کنید.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await requestOtp({
        channel,
        ...(byEmail ? { email: trimmedEmail } : { phone: normalizedPhone }),
      });
      if (!byEmail) setPhone(normalizedPhone);
      setStep("otp");
      setCooldown(res.retryAfter);
      setDevCode(res.devCode ?? "");
      setNotice(
        byEmail
          ? `کد تأیید به ${res.sentTo || trimmedEmail} ایمیل شد. ۵ دقیقه اعتبار دارد.`
          : "کد تأیید پیامک شد. ۵ دقیقه اعتبار دارد."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال کد ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async () => {
    setBusy(true);
    setError("");
    try {
      const identity = byEmail
        ? { email: email.trim() }
        : { phone: normalizePhone(phone) };
      const ticket = await verifyOtp({ ...identity, code: code.trim() });
      const result = await login({
        ...identity,
        ticket,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      if (result.admin) {
        // مدیر اصلی: مستقیم به پنل مدیریت.
        router.replace("/admin");
      }
      // مشتری: AuthProvider کاربر را ست کرد و همین صفحه پروفایل را نشان می‌دهد.
    } catch (err) {
      setError(err instanceof Error ? err.message : "کد نادرست است.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="gold-ring mx-auto mt-4 w-full max-w-md rounded-3xl glass-panel p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 text-gold">
        <LogIn size={16} />
        <h2 className="text-sm font-black">ورود / ثبت‌نام با کد یک‌بارمصرف</h2>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-sage">
        شماره موبایل یا ایمیل خود را وارد کنید؛ یک کد برایتان می‌فرستیم و بدون
        رمز عبور وارد می‌شوید. اگر حساب نداشته باشید، به‌صورت خودکار ساخته می‌شود.
      </p>

      <div className="mt-5 space-y-3 text-right">
        {step === "form" && (
          <>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold text-sage">
                روش دریافت کد
              </label>
              <div className="flex gap-2">
                {(
                  [
                    ["sms", "پیامک", MessageSquare],
                    ["email", "ایمیل", Mail],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setChannel(key);
                      setError("");
                    }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[11px] font-bold transition-colors ${
                      channel === key
                        ? "border border-gold/60 bg-gold/15 text-gold"
                        : "border border-gold/20 text-sage hover:text-cream"
                    }`}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
            </div>

            {byEmail ? (
              <Field
                label="ایمیل"
                type="email"
                dir="ltr"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                icon={<AtSign size={15} />}
              />
            ) : (
              <Field
                label="شماره موبایل"
                dir="ltr"
                inputMode="numeric"
                placeholder="09xxxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                icon={<Smartphone size={15} />}
              />
            )}

            <Field
              label="نام (اختیاری)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              icon={<UserRound size={15} />}
              hint="اگر حساب جدید ساخته شود، این نام ثبت می‌شود."
            />

            <p className="text-[10px] leading-5 text-sage/70">
              {byEmail
                ? "کد ۶ رقمی به این ایمیل فرستاده می‌شود. پوشه‌ی هرزنامه را هم ببینید."
                : "کد ۶ رقمی پیامکی به این شماره فرستاده می‌شود."}
            </p>

            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="shimmer-btn flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-[#241a05] disabled:opacity-60"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              ارسال کد تأیید
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <div>
              <Field
                label="کد ۶ رقمی"
                dir="ltr"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="text-center tracking-[0.5em]"
              />
              {devCode && (
                <p className="mt-1 text-[10px] text-gold-soft">
                  کد تست (فقط حالت توسعه): {devCode}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-sage">
              <button type="button" onClick={resetToForm} className="underline">
                {byEmail ? "تغییر ایمیل" : "تغییر شماره"}
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || busy}
                onClick={sendCode}
                className="underline disabled:opacity-50"
              >
                {cooldown > 0 ? `ارسال دوباره (${cooldown})` : "ارسال دوباره کد"}
              </button>
            </div>
            <button
              type="button"
              onClick={checkCode}
              disabled={busy || code.trim().length < 4}
              className="shimmer-btn flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-[#241a05] disabled:opacity-60"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              تأیید و ورود
            </button>
          </>
        )}

        {notice && <p className="text-xs text-gold-soft">{notice}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </motion.div>
  );
}

/* ------------------------------ Profile ------------------------------ */
type Section = "overview" | "orders" | "favorites" | "settings";

const SECTIONS: Array<{
  key: Section;
  label: string;
  icon: typeof LayoutGrid;
  /** Icons keep their own colour whether the tab is active or not. */
  tint: string;
}> = [
  { key: "overview", label: "نمای کلی", icon: LayoutGrid, tint: "text-sky-300" },
  { key: "orders", label: "سفارش‌های من", icon: Package, tint: "text-amber-300" },
  { key: "favorites", label: "علاقه‌مندی‌ها", icon: Heart, tint: "text-rose-400" },
  { key: "settings", label: "اطلاعات حساب", icon: Settings2, tint: "text-violet-300" },
];

function Profile() {
  const { user, logout } = useAuth();
  const [section, setSection] = useState<Section>("overview");

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [favorites, setFavorites] = useState<ProductDTO[] | null>(null);

  const loadFavorites = useCallback(() => {
    fetch("/api/account/favorites")
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => setFavorites(d.products ?? []))
      .catch(() => setFavorites([]));
  }, []);

  // Re-fetch everything whenever the signed-in account changes. Previously this
  // ran once, so switching accounts left the earlier customer's orders,
  // loyalty tier and favourites on screen. State is cleared to `null` first so
  // the panels fall back to their loading skeletons instead of briefly showing
  // the previous account's data, and every response is discarded if the
  // identity changed while it was in flight.
  const identity = user?.id ?? "";
  useEffect(() => {
    setOrders(null);
    setLoyalty(null);
    setFavorites(null);
    if (!identity) return;

    let alive = true;
    fetch("/api/auth/orders")
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((d) => alive && setOrders(d.orders ?? []))
      .catch(() => alive && setOrders([]));
    fetch("/api/account/loyalty")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setLoyalty(d))
      .catch(() => alive && setLoyalty(null));
    fetch("/api/account/favorites")
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => alive && setFavorites(d.products ?? []))
      .catch(() => alive && setFavorites([]));

    return () => {
      alive = false;
    };
  }, [identity]);

  const removeFavorite = async (id: number) => {
    setFavorites((list) => (list ?? []).filter((p) => p.id !== id));
    try {
      await fetch(`/api/account/favorites/${id}`, { method: "DELETE" });
    } catch {
      loadFavorites();
    }
  };

  return (
    <div className="mt-4">
      {/* fixed sign-out button — always reachable, never under the header */}
      <button
        onClick={() => logout()}
        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-red-400/40 glass-bar px-3 py-2 text-[11px] font-bold text-red-300 shadow-lg transition-colors hover:bg-red-400/15 md:fixed md:left-3 md:top-[6.5rem] md:z-[60] md:mb-0 md:w-auto md:py-1.5 md:text-xs"
      >
        <LogOut size={14} /> خروج از حساب
      </button>

      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {/* ---------- section nav (admin-panel style) ---------- */}
        <nav className="gold-ring h-max w-full min-w-0 rounded-2xl glass-panel p-2.5">
          <div className="flex w-full min-w-0 items-center gap-2.5 rounded-xl glass-soft p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold">
              <UserIcon size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-cream">{user?.name}</p>
              <p dir="ltr" className="truncate text-[10px] text-sage">{user?.email}</p>
            </div>
          </div>

          <div className="mt-2 flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
            {SECTIONS.map(({ key, label, icon: Icon, tint }) => {
              const active = section === key;
              return (
                <button
                  key={key}
                  onClick={() => setSection(key)}
                  className={`relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-colors ${
                    active ? "text-gold" : "text-sage hover:text-cream"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="account-section-pill"
                      className="absolute inset-0 -z-10 rounded-xl border border-gold/55 bg-gold/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon size={14} className={tint} />
                  {label}
                  {key === "favorites" && favorites && favorites.length > 0 && (
                    <span className="rounded-full glass-soft px-1.5 text-[10px]">
                      {toFa(favorites.length)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ---------- section body ---------- */}
        <div className="w-full min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {section === "overview" && (
                <Overview loyalty={loyalty} orders={orders} favorites={favorites} />
              )}
              {section === "orders" && <OrdersList orders={orders} />}
              {section === "favorites" && (
                <FavoritesList favorites={favorites} onRemove={removeFavorite} />
              )}
              {section === "settings" && <AccountSettings />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Overview + club ---------------------------- */
function Overview({
  loyalty,
  orders,
  favorites,
}: {
  loyalty: LoyaltyInfo | null;
  orders: Order[] | null;
  favorites: ProductDTO[] | null;
}) {
  const current: TierInfo | undefined = loyalty?.tiers.find((t) => t.key === loyalty.tier);

  return (
    <div className="space-y-4">
      {/* loyalty card */}
      <div
        className="gold-ring relative overflow-hidden rounded-3xl border border-gold/25 glass-soft p-4 sm:p-6"
        style={{ boxShadow: `inset 0 0 90px -40px ${current?.color ?? "#d4af37"}` }}
      >
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.2em] text-sage">
              <Gem size={13} /> باشگاه مشتریان بلّا
            </p>
            <p className="font-display mt-2 text-3xl leading-none text-cream sm:text-4xl">
              {loyalty ? toFa(loyalty.points) : "—"}
              <span className="mr-2 text-sm font-bold text-sage">امتیاز</span>
            </p>
            {loyalty && (
              <p className="mt-1.5 text-[11px] text-sage">
                هر {formatToman(loyalty.tomanPerPoint)} خرید = ۱ امتیاز
              </p>
            )}
          </div>

          <span
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-black sm:px-3.5 sm:text-xs"
            style={{
              borderColor: `${current?.color ?? "#d4af37"}66`,
              color: current?.color ?? "#d4af37",
            }}
          >
            <span className="text-base leading-none">{current?.icon ?? "✦"}</span>
            عضویت {current?.label ?? "عادی"}
          </span>
        </div>

        {/* progress towards the next tier */}
        {loyalty?.next ? (
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-sage">
              <span>
                تا عضویت{" "}
                {loyalty.tiers.find((t) => t.key === loyalty.next?.tier)?.label}
              </span>
              <span>{formatToman(loyalty.next.remaining)} خرید دیگر</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-night/70">
              <motion.div
                className="h-full rounded-full bg-gradient-to-l from-gold to-gold-deep"
                initial={{ width: 0 }}
                animate={{ width: `${loyalty.next.progress}%` }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ) : loyalty ? (
          <p className="mt-5 flex items-center gap-1.5 text-[11px] text-gold-soft">
            <Sparkles size={13} /> شما در بالاترین سطح عضویت قرار دارید.
          </p>
        ) : null}
      </div>

      {/* quick numbers */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <StatCard label="سفارش‌ها" value={orders ? toFa(orders.length) : "…"} />
        <StatCard
          label="جمع خرید"
          value={loyalty ? formatToman(loyalty.totalSpent) : "…"}
        />
        <StatCard
          label="علاقه‌مندی‌ها"
          value={favorites ? toFa(favorites.length) : "…"}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl glass-panel p-4 text-center">
      <p className="text-[10.5px] font-bold text-sage">{label}</p>
      <p className="mt-1.5 text-sm font-black text-gold-soft">{value}</p>
    </div>
  );
}

/* ------------------------------- Orders ------------------------------- */

/**
 * The five workflow steps, mirroring ORDER_STATUSES on the server.
 * "لغو شد" is deliberately NOT part of the progress bar — it is a dead end and
 * gets its own red treatment instead of a step circle.
 */
const ORDER_STEPS = [
  {
    status: "در انتظار تأیید",
    icon: Clock,
    hint: "سفارش ثبت شد و در صف بررسی است.",
    // Each stage owns a colour so progress is readable at a glance instead of
    // four identical gold circles.
    done: "border-amber-300 bg-gradient-to-br from-amber-200 to-amber-500",
    glow: "shadow-lg shadow-amber-400/30",
    ring: "border-amber-300",
    text: "text-amber-200",
    soft: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  },
  {
    status: "در حال آماده‌سازی",
    icon: PackageCheck,
    hint: "عطرها بسته‌بندی و مهروموم می‌شوند.",
    done: "border-sky-300 bg-gradient-to-br from-sky-200 to-sky-500",
    glow: "shadow-lg shadow-sky-400/30",
    ring: "border-sky-300",
    text: "text-sky-200",
    soft: "border-sky-300/25 bg-sky-400/10 text-sky-100",
  },
  {
    status: "ارسال شد",
    icon: Truck,
    hint: "مرسوله تحویل مامور ارسال شده است.",
    done: "border-violet-300 bg-gradient-to-br from-violet-200 to-violet-500",
    glow: "shadow-lg shadow-violet-400/30",
    ring: "border-violet-300",
    text: "text-violet-200",
    soft: "border-violet-300/25 bg-violet-400/10 text-violet-100",
  },
  {
    status: "تحویل داده شد",
    icon: ShieldCheck,
    hint: "سفارش به دست شما رسید. نوش جانتان!",
    done: "border-emerald-300 bg-gradient-to-br from-emerald-200 to-emerald-500",
    glow: "shadow-lg shadow-emerald-400/30",
    ring: "border-emerald-300",
    text: "text-emerald-200",
    soft: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  },
] as const;

const CANCELLED_STATUS = "لغو شد";

const PAYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  paid: { label: "پرداخت شده", cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" },
  pending: { label: "در انتظار پرداخت", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  unpaid: { label: "پرداخت نشده", cls: "border-gold/30 bg-gold/5 text-sage" },
  failed: { label: "پرداخت ناموفق", cls: "border-red-400/40 bg-red-400/10 text-red-300" },
  refunded: { label: "مسترد شد", cls: "border-sky-400/40 bg-sky-400/10 text-sky-300" },
};

function faDate(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Horizontal progress tracker with one icon bubble per stage. */
function OrderTracker({ order }: { order: Order }) {
  const cancelled = order.status === CANCELLED_STATUS;
  // How far the order got. -1 keeps every bubble dim for unknown statuses.
  const activeIndex = ORDER_STEPS.findIndex((s) => s.status === order.status);
  // A cancelled order still shows how far it had come before it stopped.
  const reached = cancelled
    ? ORDER_STEPS.findIndex(
        (s) =>
          s.status ===
          [...(order.timeline ?? [])]
            .reverse()
            .map((t) => t.status)
            .find((st) => st !== CANCELLED_STATUS)
      )
    : activeIndex;

  const timelineAt = (status: string) =>
    (order.timeline ?? []).find((t) => t.status === status)?.at;

  if (cancelled) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/5 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-300">
          <XCircle size={18} />
        </span>
        <div>
          <p className="text-xs font-bold text-red-300">این سفارش لغو شده است</p>
          <p className="mt-0.5 text-[11px] text-sage">
            {faDate(timelineAt(CANCELLED_STATUS)) || "مبلغ پ��داختی در صورت وجود مسترد می‌شود."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Rail behind the bubbles. The gold overlay grows with progress. */}
      <div className="absolute right-5 left-5 top-5 h-[2px] bg-gold/15" aria-hidden />
      <motion.div
        className="absolute right-5 top-5 h-[2px] bg-gradient-to-l from-amber-300 via-violet-400 to-emerald-300"
        initial={{ width: 0 }}
        animate={{
          width:
            reached <= 0
              ? "0%"
              : `calc((100% - 2.5rem) * ${reached / (ORDER_STEPS.length - 1)})`,
        }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        aria-hidden
      />
      <ol className="relative flex items-start justify-between">
        {ORDER_STEPS.map((step, i) => {
          const done = reached >= 0 && i <= reached;
          const current = i === reached;
          const Icon = step.icon;
          const at = timelineAt(step.status);
          return (
            <li key={step.status} className="flex w-1/4 flex-col items-center text-center">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 260, damping: 18 }}
                className={`relative flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                  done
                    ? `${step.done} ${step.glow} text-[#0b1a12]`
                    : "glass-soft border-gold/20 text-sage/60"
                }`}
              >
                <Icon size={17} />
                {/* Gentle pulse marks the stage the order is sitting on now. */}
                {current && (
                  <motion.span
                    className={`absolute inset-0 rounded-full border-2 ${step.ring}`}
                    animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                    aria-hidden
                  />
                )}
              </motion.span>
              <span
                className={`mt-2 text-[10px] leading-tight ${
                  done ? `font-bold ${step.text}` : "text-sage/60"
                }`}
              >
                {step.status}
              </span>
              {at && <span className="mt-0.5 text-[9px] text-sage/50">{faDate(at)}</span>}
            </li>
          );
        })}
      </ol>
      {reached >= 0 && (
        <p
          className={`mt-3 rounded-xl border px-3 py-2 text-center text-[11px] ${ORDER_STEPS[reached].soft}`}
        >
          {ORDER_STEPS[reached].hint}
        </p>
      )}
    </div>
  );
}

/** One expandable order card. */
function OrderCard({ order, index }: { order: Order; index: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const badge = PAYMENT_BADGE[order.paymentStatus ?? "unpaid"] ?? PAYMENT_BADGE.unpaid;
  // Older orders were stored before shipping existed, so fall back gracefully.
  const shippingCost = order.shippingCost ?? 0;
  const subtotal = order.subtotal ?? Math.max(0, order.total - shippingCost);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(order.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard is unavailable on insecure origins — silently ignore */
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      className="gold-ring overflow-hidden rounded-2xl glass-panel"
    >
      {/* Header: code, date, payment state */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={copyCode}
            title="کپی کد سفارش"
            className="flex items-center gap-1.5 rounded-lg bg-pine/40 px-2 py-1 font-mono text-xs text-gold-soft transition hover:bg-gold/10"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {order.code}
          </button>
          {order.createdAt && (
            <span className="text-[10px] text-sage/70">{faDate(order.createdAt)}</span>
          )}
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Stage tracker */}
      <div className="px-4 py-5">
        <OrderTracker order={order} />
      </div>

      {/* Shipping summary */}
      {(order.shippingLabel || order.trackingCode) && (
        <div className="mx-4 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gold/15 glass-soft px-3 py-2.5 text-[11px]">
          {order.shippingLabel && (
            <span className="flex items-center gap-1.5 text-sage">
              <Truck size={13} className="text-gold" />
              {order.shippingLabel}
              {order.freeShipping && <span className="text-gold-soft">(رایگان)</span>}
            </span>
          )}
          {!!order.shippingEtaDays && order.status !== "تحویل داده شد" && (
            <span className="flex items-center gap-1.5 text-sage">
              <Clock size={13} className="text-gold" />
              تا {toFa(order.shippingEtaDays)} روز کاری
            </span>
          )}
          {order.trackingCode && (
            <span className="flex items-center gap-1.5 font-mono text-gold-soft">
              <MapPin size={13} />
              کد رهگیری: {order.trackingCode}
            </span>
          )}
        </div>
      )}

      {/* Collapsed footer: total + toggle */}
      <div className="flex items-center justify-between border-t border-gold/10 px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-bold text-gold-soft hover:text-gold"
        >
          {open ? "بستن جزئیات" : `جزئیات و ${toFa((order.items ?? []).length)} قلم کالا`}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
            <ChevronDown size={14} />
          </motion.span>
        </button>
        <span className="text-sm font-black text-gold-soft">{formatToman(order.total)}</span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="overflow-hidden border-t border-gold/10 glass-soft"
          >
            <div className="space-y-3 px-4 py-4">
              {/* Line items with their bottle artwork */}
              {(order.items ?? []).map((it) => (
                <div key={it.id} className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-pine/40">
                    <ProductVisual />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-cream">{it.name}</p>
                    <p className="text-[10px] text-sage">
                      {toFa(it.qty)} × {formatToman(it.price)}
                    </p>
                  </div>
                  <span className="text-xs text-gold-soft">{formatToman(it.price * it.qty)}</span>
                </div>
              ))}

              {/* Invoice breakdown — identical to the checkout drawer */}
              <div className="space-y-1.5 border-t border-gold/10 pt-3 text-[11px]">
                <div className="flex justify-between text-sage">
                  <span>جمع کالاها</span>
                  <span className="text-cream">{formatToman(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sage">
                  <span>هزینه ارسال</span>
                  <span className={order.freeShipping ? "text-gold-soft" : "text-cream"}>
                    {order.freeShipping || shippingCost === 0
                      ? "رایگان"
                      : formatToman(shippingCost)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gold/10 pt-1.5 font-bold text-gold-soft">
                  <span>مبلغ کل</span>
                  <span>{formatToman(order.total)}</span>
                </div>
              </div>

              {/* Delivery details captured at checkout */}
              <div className="space-y-1 border-t border-gold/10 pt-3 text-[11px] text-sage">
                {(order.province || order.city) && (
                  <p className="flex items-start gap-1.5">
                    <MapPin size={12} className="mt-0.5 shrink-0 text-gold" />
                    <span>
                      {[order.province, order.city].filter(Boolean).join("، ")} — {order.address}
                    </span>
                  </p>
                )}
                {order.postalCode && (
                  <p className="flex items-center gap-1.5">
                    <Package size={12} className="shrink-0 text-gold" />
                    کد پستی: <span className="font-mono">{toFa(order.postalCode)}</span>
                  </p>
                )}
                {order.email && (
                  <p className="flex items-center gap-1.5">
                    <Mail size={12} className="shrink-0 text-gold" />
                    <span dir="ltr">{order.email}</span>
                  </p>
                )}
                {order.refId && (
                  <p className="flex items-center gap-1.5">
                    <CreditCard size={12} className="shrink-0 text-gold" />
                    کد رهگیری پرداخت: <span className="font-mono">{order.refId}</span>
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function OrdersList({ orders }: { orders: Order[] | null }) {
  if (!orders)
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-sage">
        <Loader2 size={15} className="animate-spin" /> در حال بارگذاری…
      </div>
    );
  if (orders.length === 0)
    return (
      <EmptyState
        icon={<Package size={22} />}
        title="هنوز سفارشی ثبت نکرده‌اید."
        cta="دیدن کلکسیون"
        href="/shop"
      />
    );

  return (
    <div className="space-y-4">
      {orders.map((o, index) => (
        <OrderCard key={o.id} order={o} index={index} />
      ))}
    </div>
  );
}

/* ----------------------------- Favourites ----------------------------- */
function FavoritesList({
  favorites,
  onRemove,
}: {
  favorites: ProductDTO[] | null;
  onRemove: (id: number) => void;
}) {
  if (!favorites)
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-sage">
        <Loader2 size={15} className="animate-spin" /> در حال بارگذاری…
      </div>
    );
  if (favorites.length === 0)
    return (
      <EmptyState
        icon={<Heart size={22} />}
        title="لیست علاقه‌مندی‌ها خالی است."
        cta="گشتن در کلکسیون"
        href="/shop"
      />
    );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <AnimatePresence initial={false}>
        {favorites.map((p, index) => (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ delay: index * 0.04, duration: 0.3 }}
            className="gold-ring group relative flex gap-3 rounded-2xl glass-panel p-3"
          >
            <Link href={`/shop/${p.id}`} className="h-24 w-20 shrink-0 overflow-hidden rounded-xl glass-soft">
              <ProductVisual
                image={p.image}
                glass={p.glass}
                liquid={p.liquid}
                alt={p.name}
                className="h-full w-full"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/shop/${p.id}`} className="block truncate text-sm font-black text-cream hover:text-gold-soft">
                {p.name}
              </Link>
              <p className="mt-0.5 truncate text-[11px] text-sage">{p.tagline}</p>
              <p className="mt-2 text-xs font-black text-gold-soft">{formatToman(p.price)}</p>
            </div>
            <button
              onClick={() => onRemove(p.id)}
              title="حذف از علاقه‌مندی‌ها"
              className="absolute left-2 top-2 rounded-full border border-red-400/30 bg-night/70 p-1.5 text-red-300 opacity-100 transition-opacity hover:bg-red-400/15 md:opacity-60 md:group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  cta,
  href,
}: {
  icon: ReactNode;
  title: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="gold-ring rounded-3xl glass-panel px-4 py-10 text-center sm:px-6 sm:py-12">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold/12 text-gold">
        {icon}
      </div>
      <p className="mt-3 text-sm text-sage">{title}</p>
      <Link
        href={href}
        className="shimmer-btn mt-4 inline-flex rounded-full px-5 py-2.5 text-xs font-bold text-[#241a05]"
      >
        {cta}
      </Link>
    </div>
  );
}

/* --------------------------- Account settings --------------------------- */
// Mirrors the server rule in utils/validate.js so the field can be checked
// before a round-trip. Persian/Arabic digits are normalised first.
const toLatinDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function postalCodeIssue(raw: string) {
  const v = toLatinDigits(raw).replace(/[\s-]/g, "");
  if (!v) return "";
  if (!/^\d{10}$/.test(v)) return "کد پستی باید دقیقاً ۱۰ رقم باشد.";
  if (/^(\d)\1{9}$/.test(v)) return "کد پستی معتبر نیست.";
  if (v[0] === "0" || v[4] === "2") return "کد پستی معتبر نیست.";
  return "";
}

// Mirrors addressIssue() in server/src/utils/validate.js. An empty value is
// allowed here because clearing the saved address is legitimate; the checkout
// is what insists on a real one. The word/letter checks are what stop a
// password auto-filled by the browser from being saved as an address.
function addressIssue(raw: string) {
  const v = raw.trim();
  if (!v) return "";
  if (v.length < 10) return "نشانی باید حداقل ۱۰ کاراکتر و کامل باشد.";
  if (!/\s/.test(v)) return "نشانی کامل نیست. خیابان، کوچه و پلاک را بنویسید.";
  if (!/[\u0600-\u06FFa-zA-Z]{3,}/.test(v)) return "نشانی معتبر نیست.";
  return "";
}

function AccountSettings() {
  const {
    user,
    updateProfile,
    requestIdentityOtp,
    verifyIdentityOtp,
  } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    province: "",
    city: "",
    postalCode: "",
  });
  const [provinces, setProvinces] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pendingIdentity, setPendingIdentity] = useState<{
    field: IdentityField;
    value: string;
    sentTo: string;
    channel: OtpChannel;
    stage: "current" | "destination";
  } | null>(null);
  const [identityCode, setIdentityCode] = useState("");
  const [identityNotice, setIdentityNotice] = useState("");
  const [identityDevCode, setIdentityDevCode] = useState("");
  const [identityCooldown, setIdentityCooldown] = useState(0);

  // Reload the form whenever the signed-in identity changes, so a different
  // account never inherits the previous one's values.
  const identity = user?.id ?? "";
  useEffect(() => {
    setForm({
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      address: user?.address ?? "",
      province: user?.province ?? "",
      city: user?.city ?? "",
      postalCode: user?.postalCode ?? "",
    });
    setSaved(false);
    setError("");
    setPendingIdentity(null);
    setIdentityCode("");
    setIdentityNotice("");
    setIdentityDevCode("");
    setIdentityCooldown(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  useEffect(() => {
    if (identityCooldown <= 0) return;
    const timer = setTimeout(() => setIdentityCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [identityCooldown]);

  // Same province list the checkout uses, so the two can never disagree.
  useEffect(() => {
    let alive = true;
    fetch("/api/shipping/options")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && Array.isArray(d?.provinces)) setProvinces(d.provinces);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const pcIssue = postalCodeIssue(form.postalCode);
  const addrIssue = addressIssue(form.address);

  const profilePayload = () => ({
    ...form,
    email: form.email.trim().toLowerCase(),
    phone: normalizePhone(form.phone),
    // Send the normalised value so the stored code always matches what the
    // shipping engine expects.
    postalCode: toLatinDigits(form.postalCode).replace(/[\s-]/g, ""),
  });

  const validate = () => {
    if (!form.name.trim()) return "نام نمی‌تواند خالی باشد.";
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) {
      return "ایمیل معتبر وارد کنید.";
    }
    if (!PHONE_RE.test(normalizePhone(form.phone))) {
      return "شماره موبایل را به صورت 09xxxxxxxxx وارد کنید.";
    }
    return pcIssue || addrIssue;
  };

  const requestChangeCode = async (
    field: IdentityField,
    value: string,
    stage: "current" | "destination" = "current",
    currentTicket?: string
  ) => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await requestIdentityOtp({ field, value, stage, currentTicket });
      setPendingIdentity({
        field,
        value,
        sentTo: result.sentTo,
        channel: result.channel,
        stage,
      });
      setIdentityCode("");
      setIdentityDevCode(result.devCode ?? "");
      setIdentityCooldown(result.retryAfter);
      setIdentityNotice(
        result.channel === "email"
          ? `کد تأیید به ${result.sentTo} ایمیل شد.`
          : `کد تأیید به ${result.sentTo} پیامک شد.`
      );
    } catch (err) {
      // A destination request consumes the current-phone proof before sending.
      // If delivery fails, restart the two-step verification from the beginning.
      if (stage === "destination") setPendingIdentity(null);
      setError(err instanceof Error ? err.message : "ارسال کد تأیید ناموفق بود.");
    } finally {
      setSaving(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pendingIdentity) {
      setError("ابتدا کد تغییر شناسه را تأیید یا عملیات را لغو کنید.");
      return;
    }

    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }

    const nextPhone = normalizePhone(form.phone);
    const nextEmail = form.email.trim().toLowerCase();
    const phoneChanged = nextPhone !== normalizePhone(user?.phone ?? "");
    const emailChanged = nextEmail !== (user?.email ?? "").trim().toLowerCase();

    if (phoneChanged && emailChanged) {
      setError("شماره و ایمیل را جداگانه ذخیره کنید تا هر مقصد مستقل تأیید شود.");
      return;
    }
    if (phoneChanged) {
      await requestChangeCode("phone", nextPhone);
      return;
    }
    if (emailChanged) {
      await requestChangeCode("email", nextEmail);
      return;
    }

    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await updateProfile(profilePayload());
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره.");
    } finally {
      setSaving(false);
    }
  };

  const confirmIdentityChange = async () => {
    if (!pendingIdentity || !/^\d{6}$/.test(toLatinDigits(identityCode).trim())) {
      setError("کد تأیید ۶ رقمی را وارد کنید.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const ticket = await verifyIdentityOtp({
        field: pendingIdentity.field,
        value: pendingIdentity.value,
        stage: pendingIdentity.stage,
        code: toLatinDigits(identityCode).trim(),
      });

      if (pendingIdentity.stage === "current") {
        // Removing e-mail has no new destination, so control of the current
        // verified phone is the final proof. Other changes continue to step 2.
        if (pendingIdentity.field === "email" && !pendingIdentity.value) {
          await updateProfile({
            ...profilePayload(),
            currentIdentityTicket: ticket,
          });
        } else {
          await requestChangeCode(
            pendingIdentity.field,
            pendingIdentity.value,
            "destination",
            ticket
          );
          return;
        }
      } else {
        const ticketPayload =
          pendingIdentity.field === "phone"
            ? { phoneTicket: ticket }
            : { emailTicket: ticket };
        await updateProfile({ ...profilePayload(), ...ticketPayload });
      }

      setPendingIdentity(null);
      setIdentityCode("");
      setIdentityNotice("");
      setIdentityDevCode("");
      setIdentityCooldown(0);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تأیید تغییر شناسه ناموفق بود.");
    } finally {
      setSaving(false);
    }
  };

  const cancelIdentityChange = () => {
    setPendingIdentity(null);
    setIdentityCode("");
    setIdentityNotice("");
    setIdentityDevCode("");
    setIdentityCooldown(0);
    setError("");
  };

  return (
    <form
      onSubmit={save}
      className="gold-ring space-y-3 rounded-3xl glass-panel p-4 text-right sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-gold">اطلاعات حساب</h2>
        <span className="text-[10px] text-sage/70">این اطلاعات هنگام پرداخت خودکار پر می‌شود</span>
      </div>

      <Field
        label="نام"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        autoComplete="name"
        icon={<UserRound size={15} />}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="شماره تماس"
          dir="ltr"
          inputMode="numeric"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          autoComplete="tel"
          icon={<Smartphone size={15} />}
          disabled={Boolean(pendingIdentity)}
          hint="تغییر شماره پس از تأیید شماره فعلی و سپس شماره جدید انجام می‌شود."
        />
        <Field
          label="ایمیل"
          type="email"
          dir="ltr"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          autoComplete="email"
          icon={<Mail size={15} />}
          disabled={Boolean(pendingIdentity)}
          hint="تغییر ایمیل پس از تأیید شماره فعلی و سپس ایمیل جدید انجام می‌شود."
        />
      </div>

      {pendingIdentity && (
        <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] p-4">
          <div className="flex items-start gap-2">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-gold" />
            <div>
              <p className="text-xs font-bold text-gold-soft">
                {pendingIdentity.stage === "current"
                  ? pendingIdentity.field === "email" && !pendingIdentity.value
                    ? "تأیید حذف ایمیل با شماره فعلی"
                    : "مرحله ۱ از ۲: تأیید شماره فعلی"
                  : `مرحله ۲ از ۲: تأیید ${
                      pendingIdentity.field === "phone" ? "شماره جدید" : "ایمیل جدید"
                    }`}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-sage">{identityNotice}</p>
            </div>
          </div>
          <div className="mt-3">
            <Field
              label="کد ۶ رقمی"
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={identityCode}
              onChange={(e) => setIdentityCode(e.target.value)}
              className="text-center tracking-[0.45em]"
              autoComplete="one-time-code"
            />
            {identityDevCode && (
              <p className="mt-1 text-[10px] text-gold-soft">
                کد تست (فقط حالت توسعه): {identityDevCode}
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmIdentityChange}
              disabled={saving || toLatinDigits(identityCode).trim().length !== 6}
              className="btn-emerald flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-60"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              تأیید و ذخیره
            </button>
            <button
              type="button"
              onClick={() => requestChangeCode(pendingIdentity.field, pendingIdentity.value)}
              disabled={
                saving ||
                (pendingIdentity.stage === "current" && identityCooldown > 0)
              }
              className="rounded-full border border-gold/25 px-4 py-2 text-xs text-gold-soft disabled:opacity-50"
            >
              {pendingIdentity.stage === "destination"
                ? "شروع دوباره از تأیید شماره فعلی"
                : identityCooldown > 0
                  ? `ارسال دوباره (${identityCooldown})`
                  : "ارسال دوباره کد"}
            </button>
            <button
              type="button"
              onClick={cancelIdentityChange}
              disabled={saving}
              className="rounded-full border border-red-400/25 px-4 py-2 text-xs text-red-300 disabled:opacity-50"
            >
              لغو
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="استان"
          value={form.province}
          onChange={(e) => set("province", e.target.value)}
          autoComplete="address-level1"
          icon={<MapPin size={15} />}
        >
          <option value="">انتخاب استان</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>
        <Field
          label="شهر"
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
          autoComplete="address-level2"
        />
      </div>

      <Field
        label="کد پستی"
        dir="ltr"
        inputMode="numeric"
        maxLength={12}
        value={form.postalCode}
        onChange={(e) => set("postalCode", e.target.value)}
        placeholder="۱۰ رقم بدون خط تیره"
        autoComplete="postal-code"
        icon={<Hash size={15} />}
        error={pcIssue || undefined}
        hint="برای تحویل مرسوله لازم است."
      />

      <TextField
        label="آدرس"
        rows={3}
        value={form.address}
        onChange={(e) => set("address", e.target.value)}
        placeholder="خیابان، کوچه، پلاک، واحد…"
        autoComplete="street-address"
        error={addrIssue || undefined}
        hint="نشانی کامل پستی — همین مقدار هنگام پرداخت پیشنهاد می‌شود."
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        disabled={saving || Boolean(pendingIdentity)}
        className="btn-emerald flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold disabled:opacity-60"
      >
        {saved && !saving ? <Check size={14} /> : null}
        {saving
          ? "در حال ذخیره…"
          : pendingIdentity
            ? "ابتدا کد را تأیید کنید"
            : saved
              ? "ذخیره شد"
              : "ذخیره پروفایل"}
      </button>
    </form>
  );
}
