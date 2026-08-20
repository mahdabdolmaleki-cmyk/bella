"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Plus,
  Minus,
  ShoppingBag,
  Trash2,
  CheckCircle2,
  Truck,
  Loader2,
  Check,
  UserRound,
  Phone,
  Mail,
  Hash,
} from "lucide-react";
import { ProductVisual } from "./art";
import { useAuth } from "./AuthContext";
import { formatToman, toFa } from "@/lib/data";
import type { ShippingOption, ShippingQuote } from "@/lib/types";
import { Field, SelectField, TextField } from "./Field";
import { useRouter } from "next/navigation";

export type CartLine = {
  id: number;
  name: string;
  price: number;
  glass: string;
  liquid: string;
  image?: string | null;
  sizeMl: number;
  qty: number;
};

type Ctx = {
  items: CartLine[];
  count: number;
  add: (p: Omit<CartLine, "qty">) => void;
  setQty: (id: number, qty: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  toast: string | null;
};

export const MAX_QTY = 99;
const MAX_LINES = 50;

/** Mirrors FREE_SHIPPING_THRESHOLD in server/src/utils/shipping.js. */
const FREE_SHIPPING_THRESHOLD = 5_000_000;

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Persian/Arabic digits -> latin, then strip separators. */
function toLatinDigits(input: string) {
  return input
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Same rule as isPostalCode() on the server, so the user is never surprised. */
function isPostalCode(value: string) {
  const raw = toLatinDigits(value).replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(raw)) return null;
  if (/^(\d)\1{9}$/.test(raw)) return null;
  if (raw[0] === "0" || raw[4] === "2") return null;
  return raw;
}

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    Number.isFinite(v.id) &&
    typeof v.name === "string" &&
    typeof v.price === "number" &&
    Number.isFinite(v.price) &&
    typeof v.qty === "number" &&
    Number.isFinite(v.qty) &&
    v.qty > 0
  );
}

const CartCtx = createContext<Ctx | null>(null);
export const useCart = () => {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart outside provider");
  return c;
};

// The cart used to live under a single global key, which meant one browser
// shared one basket across every account that signed in on it. Baskets are now
// namespaced per identity so signing out can never expose the previous
// customer's items to the next one.
const LEGACY_CART_KEY = "bella-cart";
const cartStorageKey = (identity: string) => `bella-cart:${identity}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const { user, loading: authLoading } = useAuth();
  // `null` while the session is still being resolved, so we never read or write
  // the guest basket for a user who is about to be identified.
  const identity = authLoading ? null : user?.id ?? "guest";
  // The key the persist effect must write to. Kept in a ref so a pending write
  // always lands under the identity the items actually belong to.
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    const key = cartStorageKey(identity);
    // Block persistence until this identity's basket is loaded, otherwise the
    // previous account's items would be written under the new account's key.
    setHydrated(false);
    activeKeyRef.current = null;

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
      // One-time migration of the old shared basket, but only into the guest
      // namespace — it can't be attributed to any signed-in account.
      if (raw === null && identity === "guest") {
        const legacy = localStorage.getItem(LEGACY_CART_KEY);
        if (legacy !== null) {
          raw = legacy;
          localStorage.removeItem(LEGACY_CART_KEY);
        }
      }
    } catch {
      raw = null;
    }

    let next: CartLine[] = [];
    if (raw) {
      try {
        // localStorage is user-writable, so never trust its shape blindly:
        // a malformed value used to crash the whole app on render.
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) next = parsed.filter(isCartLine).slice(0, MAX_LINES);
      } catch {
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      }
    }

    setItems(next);
    activeKeyRef.current = key;
    setHydrated(true);
  }, [identity]);

  useEffect(() => {
    if (!hydrated || !activeKeyRef.current) return;
    try {
      localStorage.setItem(activeKeyRef.current, JSON.stringify(items));
    } catch {
      // Quota exceeded / private mode — must not break the UI.
    }
  }, [items, hydrated]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const add = useCallback(
    (p: Omit<CartLine, "qty">) => {
      setItems((prev) => {
        const found = prev.find((i) => i.id === p.id);
        if (found) {
          // Clamp so the quantity can never exceed what the API accepts.
          return prev.map((i) =>
            i.id === p.id ? { ...i, qty: Math.min(MAX_QTY, i.qty + 1) } : i,
          );
        }
        if (prev.length >= MAX_LINES) return prev;
        return [...prev, { ...p, qty: 1 }];
      });
      flash(`«${p.name}» به سبد خرید اضافه شد`);
    },
    [flash],
  );

  const setQty = useCallback((id: number, qty: number) => {
    const safeQty = Math.min(MAX_QTY, Math.floor(Number(qty) || 0));
    setItems((prev) =>
      safeQty <= 0
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, qty: safeQty } : i)),
    );
  }, []);

  const remove = useCallback((id: number) => setItems((prev) => prev.filter((i) => i.id !== id)), []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);

  return (
    <CartCtx.Provider value={{ items, count, add, setQty, remove, clear, open, setOpen, toast }}>
      {children}
    </CartCtx.Provider>
  );
}

/* ------------------------------------------------------------------ */
export function CartDrawer() {
  const { items, open, setOpen, setQty, remove, clear } = useCart();
  const router = useRouter();
  const [step, setStep] = useState<"cart" | "form" | "done">("cart");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    province: "",
    city: "",
    postalCode: "",
    address: "",
  });
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  // ── Shipping state ─────────────────────────────────────────────
  const [provinces, setProvinces] = useState<string[]>([]);
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [method, setMethod] = useState("");

  // ── v33: حالت به‌روزرسانی سایت ──────────────────────
  // تنظیمات عمومی هر بار که سبد باز می‌شود خوانده می‌شود، تا اگر مدیر
  // وسط کار فروش را بست، مشتری پیش از پرکردن فرم متوجه شود.
  const [maintenance, setMaintenance] = useState({ off: false, note: "" });
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.settings) return;
        setMaintenance({
          off: d.settings.paymentsDisabled === "1",
          note: String(d.settings.paymentsDisabledNote || ""),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const { user } = useAuth();

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  // The courier the buyer picked, re-read from the latest quote so the price
  // shown always belongs to the current cart and destination.
  const selected: ShippingOption | null = useMemo(() => {
    if (!quote) return null;
    return quote.options.find((o) => o.key === method) ?? quote.options[0] ?? null;
  }, [quote, method]);

  const shippingCost = selected?.cost ?? 0;
  const total = subtotal + shippingCost;

  // Free-shipping progress uses the server threshold once we have a quote,
  // and the mirrored constant before that (cart step, no province yet).
  const freeThreshold = quote?.freeThreshold ?? FREE_SHIPPING_THRESHOLD;
  const freeShip = subtotal >= freeThreshold;

  // Whenever the signed-in identity changes (login, logout, account switch) the
  // checkout form is OVERWRITTEN — never merged. The previous merge kept any
  // value the earlier account had typed, so the old customer's name, phone and
  // address leaked into the next person's order. Everything derived from that
  // identity (step, quote, courier, order code) is reset with it.
  const identity = user?.id ?? "guest";
  useEffect(() => {
    setForm({
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      email: user?.email ?? "",
      province: user?.province ?? "",
      city: user?.city ?? "",
      postalCode: user?.postalCode ?? "",
      address: user?.address ?? "",
    });
    setStep("cart");
    setCode("");
    setErr("");
    setQuote(null);
    setMethod("");
    setBusy(false);
    // Intentionally keyed on the identity only: editing your own profile should
    // not wipe what you are currently typing at checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  // The province list is static; fetch it once the checkout step is opened.
  useEffect(() => {
    if (step !== "form" || provinces.length > 0) return;
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
  }, [step, provinces.length]);

  // Re-quote whenever the destination or the cart contents change. The request
  // is debounced and every stale response is discarded, so quickly switching
  // provinces can never leave an out-of-date price on screen.
  const cartKey = useMemo(
    () => items.map((i) => `${i.id}:${i.qty}`).join(","),
    [items]
  );

  useEffect(() => {
    if (step !== "form" || !form.province || items.length === 0) {
      setQuote(null);
      return;
    }
    let alive = true;
    setQuoting(true);
    const timer = setTimeout(() => {
      fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          province: form.province,
          items: items.map((i) => ({ id: i.id, qty: i.qty })),
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ShippingQuote | null) => {
          if (!alive) return;
          setQuote(d && Array.isArray(d.options) ? d : null);
          // Keep the choice if it is still offered for this destination,
          // otherwise fall back to the first (cheapest listed) courier.
          if (d?.options?.length) {
            setMethod((prev) =>
              d.options.some((o) => o.key === prev) ? prev : d.options[0].key
            );
          }
        })
        .catch(() => {
          if (alive) setQuote(null);
        })
        .finally(() => {
          if (alive) setQuoting(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [step, form.province, cartKey, items]);

  const submit = async () => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    const city = form.city.trim();
    const address = form.address.trim();
    const postalCode = isPostalCode(form.postalCode);

    if (!name || !phone || !email || !form.province || !city || !address) {
      setErr("لطفاً همه‌ی فیلدها را کامل کنید.");
      return;
    }
    if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) {
      setErr("شماره تماس معتبر وارد کنید.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setErr("ایمیل معتبر وارد کنید تا فاکتور برایتان ارسال شود.");
      return;
    }
    if (!postalCode) {
      setErr("کد پستی باید ۱۰ رقم و معتبر باشد.");
      return;
    }
    if (address.length < 10) {
      setErr("نشانی را کامل‌تر وارد کنید.");
      return;
    }
    if (!selected) {
      setErr("روش ارسال را انتخاب کنید.");
      return;
    }
    if (items.length === 0 || busy) return;

    setBusy(true);
    setErr("");

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Only ids and quantities are sent — prices are recalculated on the
        // server, so a tampered request cannot change what is charged.
        // The shipping cost is NOT sent: only the chosen courier key. The
        // server re-prices it, so a tampered request cannot lower the charge.
        body: JSON.stringify({
          customerName: name,
          phone,
          email,
          province: form.province,
          city,
          postalCode,
          address,
          shippingMethod: selected.key,
          items: items.map((i) => ({ id: i.id, qty: i.qty })),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 429) {
          setErr("درخواست‌های زیادی ارسال شده است. لطفاً کمی بعد تلاش کنید.");
        } else {
          setErr(data?.error ?? "خطا در ثبت سفارش");
        }
        return;
      }

      // Guard against a malformed success payload (used to throw on data.order).
      const orderCode = String(data?.order?.code ?? "");
      setCode(orderCode);

      // Online payment (ZarinPal): ask the server for a gateway URL and go there.
      if (data?.payment?.online && orderCode) {
        try {
          const payRes = await fetch("/api/payment/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ code: orderCode }),
          });
          const payData = await payRes.json().catch(() => null);
          if (payRes.ok && typeof payData?.url === "string") {
            clear();
            window.location.href = payData.url;
            return;
          }
          // BUG FIX: execution used to fall through to setStep("done"), so the
          // user saw the success screen and this error message disappeared.
          setErr(payData?.error ?? "اتصال به درگاه پرداخت ممکن نشد. سفارش ثبت شد و اپراتور تماس می‌گیرد.");
          return;
        } catch {
          setErr("اتصال به درگاه پرداخت ممکن نشد. سفارش شما ثبت شده است.");
          return;
        }
      }

      setStep("done");
      clear();
    } catch {
      setErr("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
    } finally {
      // BUG FIX: setBusy(false) was skipped whenever fetch threw, which left
      // the pay button disabled forever.
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.aside
            className="fixed top-0 left-0 z-[70] flex h-full w-full max-w-md flex-col border-r border-gold/25 bg-forest shadow-2xl"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <header className="flex items-center justify-between border-b border-gold/20 px-5 py-4">
              <h3 className="flex items-center gap-2 text-lg font-black text-cream">
                <ShoppingBag size={18} className="text-gold" />
                سبد خرید شما
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full border border-gold/30 p-2 text-gold transition-colors hover:bg-gold/10"
                aria-label="بستن"
              >
                <X size={16} />
              </button>
            </header>

            {step === "done" ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 12 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-gold/15 text-gold"
                >
                  <CheckCircle2 size={42} />
                </motion.div>
                <h4 className="mt-6 text-xl font-black text-cream">سفارش شما ثبت شد</h4>
                <p className="mt-2 text-sm text-sage">
                  کد پیگیری: <span className="font-bold text-gold-soft">{code}</span>
                </p>
                <p className="mt-2 text-xs leading-6 text-sage">
                  همکاران ما برای هماهنگی ارسال با شما تماس خواهند گرفت. پاکت مخملی بلا در راه است!
                </p>
                <button
                  onClick={() => {
                    setStep("cart");
                    setOpen(false);
                  }}
                  className="shimmer-btn mt-8 rounded-full px-8 py-3 text-sm font-bold text-[#241a05]"
                >
                  ادامه خرید
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-gold/25 text-gold/60">
                  <ShoppingBag size={34} />
                </div>
                <p className="text-sm text-sage">سبد خرید شما هنوز خالی است.</p>
                <button
                  onClick={() => {
                    setOpen(false);
                    router.push("/shop");
                  }}
                  className="rounded-full border border-gold/40 px-6 py-2.5 text-xs font-bold text-gold-soft hover:bg-gold/10"
                >
                  مشاهده کلکسیون
                </button>
              </div>
            ) : step === "cart" ? (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  <AnimatePresence initial={false}>
                    {items.map((i) => (
                      <motion.div
                        key={i.id}
                        layout
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -60 }}
                        className="flex items-center gap-3 rounded-2xl glass-panel p-3"
                      >
                        <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-pine/40 to-night">
                          <ProductVisual image={i.image} glass={i.glass} liquid={i.liquid} alt={i.name} className="w-9" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-cream">{i.name}</p>
                          <p className="mt-0.5 text-[11px] text-sage">{toFa(i.sizeMl)} میل</p>
                          <p className="mt-1 text-xs font-bold text-gold-soft">{formatToman(i.price)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={() => remove(i.id)}
                            className="text-sage/60 transition-colors hover:text-red-400"
                            aria-label="حذف"
                          >
                            <Trash2 size={15} />
                          </button>
                          <div className="flex items-center gap-2 rounded-full border border-gold/25 px-2 py-1">
                            <button onClick={() => setQty(i.id, i.qty + 1)} className="text-gold hover:scale-110" aria-label="افزایش">
                              <Plus size={14} />
                            </button>
                            <span className="min-w-4 text-center text-xs font-bold text-cream">{toFa(i.qty)}</span>
                            <button onClick={() => setQty(i.id, i.qty - 1)} className="text-gold hover:scale-110" aria-label="کاهش">
                              <Minus size={14} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <footer className="border-t border-gold/20 px-5 py-4">
                  <div className="mb-3 flex items-center gap-2 rounded-xl glass-soft px-3 py-2 text-[11px] text-sage">
                    <Truck size={14} className="shrink-0 text-gold" />
                    {freeShip ? (
                      <span className="text-gold-soft">تبریک! ارسال سفارش شما رایگان شد.</span>
                    ) : (
                      <span>
                        تا ارسال رایگان: {formatToman(freeThreshold - subtotal)} دیگر
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-sage">جمع کل</span>
                    <span className="text-lg font-black text-gold-soft">{formatToman(subtotal)}</span>
                  </div>
                  {/* سفارش مهمان حذف شد: فقط کاربر واردشده می‌تواند به مرحلهٔ
                      ثبت سفارش برود. سرور هم در POST /api/orders همین قانون را دارد،
                      پس بستن فقط در رابط کاربری اتفاق نمی‌افتد. */}
                  {maintenance.off ? (
                    /* v33 — فروشگاه در حالت به‌روزرسانی است. سرور هم همین قانون را دارد. */
                    <div className="mt-4 space-y-2.5">
                      <p className="rounded-xl border border-orange-300/30 bg-orange-300/[0.08] px-3 py-2.5 text-[11px] leading-6 text-cream/85">
                        {maintenance.note.trim() ||
                          "فروشگاه به‌دلیل به‌روزرسانی موقتاً سفارش نمی‌پذیرد."}
                      </p>
                      <button
                        disabled
                        className="w-full cursor-not-allowed rounded-full border border-gold/20 py-3.5 text-sm font-bold text-sage/70"
                      >
                        ثبت سفارش موقتاً غیرفعال است
                      </button>
                    </div>
                  ) : user ? (
                    <button
                      onClick={() => setStep("form")}
                      className="shimmer-btn mt-4 w-full rounded-full py-3.5 text-sm font-bold text-[#241a05] transition-transform hover:scale-[1.02] active:scale-95"
                    >
                      ادامه و ثبت سفارش
                    </button>
                  ) : (
                    <div className="mt-4 space-y-2.5">
                      <p className="rounded-xl border border-gold/20 bg-gold/[0.05] px-3 py-2.5 text-[11px] leading-6 text-sage">
                        برای ثبت سفارش باید وارد حساب کاربری شوید. سبد خرید شما
                        محفوظ می‌ماند و بعد از ورود ادامه می‌دهید.
                      </p>
                      <button
                        onClick={() => {
                          setOpen(false);
                          router.push("/account");
                        }}
                        className="shimmer-btn w-full rounded-full py-3.5 text-sm font-bold text-[#241a05] transition-transform hover:scale-[1.02] active:scale-95"
                      >
                        ورود / ایجاد حساب کاربری
                      </button>
                    </div>
                  )}
                </footer>
              </>
            ) : (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  <p className="text-sm text-sage">اطلاعات تحویل را وارد کنید:</p>
                  {/* Checkout never writes back to the account: these values are
                      stored on the order only. Editing the saved profile is done
                      in حساب کاربری ← اطلاعات حساب. */}
                  <p className="rounded-xl border border-gold/15 bg-gold/[0.04] px-3 py-2 text-[10.5px] leading-5 text-sage">
                    نام، شماره و ایمیل از حساب کاربری شما خوانده می‌شود و اینجا قابل
                    تغییر نیست؛ فقط نشانی تحویل را می‌توانید ویرایش کنید. برای تغییر
                    نام/شماره/ایمیل به{" "}
                    <a href="/account" className="font-bold text-gold-soft underline">
                      حساب کاربری ← اطلاعات حساب
                    </a>{" "}
                    بروید.
                  </p>

                  {/* autoComplete روی همهٔ فیلدها لازم است: بدون آن، مدیرهای رمز
                      جعبه‌های متنی را هدف پر‌کردن می‌دانند و ممکن است رمز ذخیره‌شده را
                      داخل فیلد آدرس بریزند. */}
                  <Field
                    label="نام و نام خانوادگی"
                    value={form.name}
                    readOnly
                    disabled
                    autoComplete="name"
                    icon={<UserRound size={15} />}
                    className="cursor-not-allowed"
                    hint="از حساب کاربری خوانده می‌شود."
                  />
                  <Field
                    label="شماره تماس"
                    type="tel"
                    value={form.phone}
                    readOnly
                    disabled
                    autoComplete="tel"
                    icon={<Phone size={15} />}
                    className="cursor-not-allowed"
                    hint="از حساب کاربری خوانده می‌شود."
                  />
                  <Field
                    label="ایمیل"
                    type="email"
                    dir="ltr"
                    value={form.email}
                    readOnly
                    disabled
                    autoComplete="email"
                    icon={<Mail size={15} />}
                    className="cursor-not-allowed"
                    hint="از حساب کاربری خوانده می‌شود؛ فاکتور به همین نشانی می‌رود."
                  />
                  {(!form.name.trim() || !form.email.trim()) && (
                    <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-5 text-amber-200">
                      برای تکمیل خرید، نام و ایمیل باید در حساب شما ثبت باشد. از{" "}
                      <a href="/account" className="font-bold underline">حساب کاربری</a> آن‌ها را کامل کنید.
                    </p>
                  )}

                  {/* Destination: the province drives the courier pricing zone. */}
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField
                      label="استان"
                      value={form.province}
                      onChange={(e) => setForm({ ...form, province: e.target.value })}
                      autoComplete="address-level1"
                    >
                      <option value="">انتخاب کنید…</option>
                      {provinces.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </SelectField>
                    <Field
                      label="شهر"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="مثلاً: کرج"
                      autoComplete="address-level2"
                    />
                  </div>

                  <Field
                    label="کد پستی (۱۰ رقم)"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={12}
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                    placeholder="۱۲۳۴۵۶۷۸۹۰"
                    autoComplete="postal-code"
                    className="tracking-widest"
                    icon={<Hash size={15} />}
                    hint="کد پستی برای تحویل درست مرسوله الزامی است."
                  />

                  <TextField
                    label="آدرس کامل"
                    rows={3}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="خیابان، کوچه، پلاک، واحد…"
                    autoComplete="street-address"
                  />

                  {/* ── Courier picker ─────────────────────────────── */}
                  <div className="pt-1">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-gold-soft">روش ارسال</span>
                      {quoting && (
                        <span className="flex items-center gap-1 text-[10px] text-sage">
                          <Loader2 size={11} className="animate-spin" />
                          در حال محاسبه…
                        </span>
                      )}
                    </div>

                    {!form.province ? (
                      <p className="rounded-xl glass-soft px-3 py-3 text-[11px] text-sage">
                        ابتدا استان مقصد را انتخاب کنید تا هزینه ارسال محاسبه شود.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(quote?.options ?? []).map((o) => {
                          const active = selected?.key === o.key;
                          return (
                            <button
                              key={o.key}
                              type="button"
                              onClick={() => setMethod(o.key)}
                              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-right transition ${
                                active
                                  ? "border-gold bg-gold/10"
                                  : "border-gold/20 glass-soft hover:border-gold/40"
                              }`}
                            >
                              <span
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                                  active ? "bg-gold text-[#241a05]" : "bg-pine/60 text-gold-soft"
                                }`}
                              >
                                {active ? <Check size={16} /> : <Truck size={16} />}
                              </span>
                              <span className="flex-1">
                                <span className="block text-xs font-bold text-cream">{o.label}</span>
                                <span className="block text-[10px] text-sage">
                                  {o.desc} · تحویل {toFa(o.etaDays.min)} تا {toFa(o.etaDays.max)} روز کاری
                                </span>
                              </span>
                              <span className="shrink-0 text-left">
                                {o.free ? (
                                  <>
                                    <span className="block text-[10px] text-sage line-through">
                                      {formatToman(o.listPrice)}
                                    </span>
                                    <span className="block text-xs font-black text-gold-soft">رایگان</span>
                                  </>
                                ) : (
                                  <span className="block text-xs font-black text-gold-soft">
                                    {formatToman(o.cost)}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                        {!quoting && !quote && (
                          <p className="rounded-xl bg-red-500/10 px-3 py-3 text-[11px] text-red-300">
                            محاسبه هزینه ارسال ممکن نشد. دوباره تلاش کنید.
                          </p>
                        )}
                        {quote && (
                          <p className="px-1 text-[10px] text-sage/70">
                            وزن تخمینی مرسوله: {toFa(quote.billableKg)} کیلوگرم · مقصد: {quote.zoneLabel}
                            {quote.freeRemaining > 0 && (
                              <> · تا ارسال رایگان {formatToman(quote.freeRemaining)} دیگر</>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Invoice breakdown ──────────────────────────── */}
                  <div className="space-y-2 rounded-xl glass-soft px-4 py-3">
                    <div className="flex items-center justify-between text-xs text-sage">
                      <span>جمع سبد خرید</span>
                      <span className="text-cream">{formatToman(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-sage">
                      <span>هزینه ارسال{selected ? ` (${selected.label})` : ""}</span>
                      <span className={selected?.free ? "text-gold-soft" : "text-cream"}>
                        {!selected ? "—" : selected.free ? "رایگان" : formatToman(selected.cost)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gold/15 pt-2">
                      <span className="text-xs font-bold text-gold-soft">مبلغ قابل پرداخت</span>
                      <span className="text-base font-black text-gold-soft">{formatToman(total)}</span>
                    </div>
                  </div>

                  {err && <p className="text-xs text-red-400">{err}</p>}
                </div>
                <footer className="flex gap-3 border-t border-gold/20 px-5 py-4">
                  <button
                    onClick={() => setStep("cart")}
                    className="btn-ghost rounded-full px-5 py-3 text-xs font-bold"
                  >
                    بازگشت
                  </button>
                  <button
                    onClick={submit}
                    disabled={busy || quoting || !selected || !form.name.trim() || !form.email.trim()}
                    className="btn-emerald flex-1 rounded-full py-3 text-sm font-bold disabled:opacity-60"
                  >
                    {busy
                      ? "در حال ثبت..."
                      : !selected
                        ? "انتخاب روش ارسال"
                        : `پرداخت ${formatToman(total)}`}
                  </button>
                </footer>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
export function Toast() {
  const { toast } = useCart();
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="gold-ring fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-gold/40 glass-bar px-6 py-3 text-xs font-bold text-gold-soft shadow-2xl"
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
