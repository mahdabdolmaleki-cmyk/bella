"use client";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Loader2, ShieldCheck, MessageCircle, Send, CheckCircle2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { toFa } from "@/lib/data";
import type { Review, ReviewSummary } from "@/lib/types";

/* ==================================================================== */
/*  نقد و بررسی‌ها — public review list + submit form                      */
/*  Reviews are moderated: a new one is stored as "pending" and only     */
/*  appears here after an admin approves it in the panel.                */
/* ==================================================================== */

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} از ۵`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(value) ? "text-gold" : "text-sage/30"}
          fill={n <= Math.round(value) ? "currentColor" : "none"}
          strokeWidth={1.6}
        />
      ))}
    </span>
  );
}

function fmtDate(value: string | Date) {
  try {
    return new Date(value).toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function Reviews({ productId }: { productId: number }) {
  const { user } = useAuth();
  const [data, setData] = useState<ReviewSummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoadError(false);
      fetch(`/api/reviews/${productId}`, { signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
        .then((d: ReviewSummary) => setData(d))
        .catch((err) => {
          if ((err as { name?: string })?.name !== "AbortError") setLoadError(true);
        });
    },
    [productId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /* ---------------- submit form state ---------------- */
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [sent, setSent] = useState("");

  // Pre-fill the name for signed-in customers, but let them change it.
  useEffect(() => {
    if (user?.name) setName((current) => current || user.name);
  }, [user]);

  const submit = async () => {
    setSending(true);
    setFormError("");
    try {
      const res = await fetch(`/api/reviews/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rating, body }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(payload.error || "ارسال نقد انجام نشد.");
        setSending(false);
        return;
      }
      setSent(payload.message || "نقد شما ارسال شد.");
      setBody("");
      setRating(5);
      setSending(false);
    } catch {
      setFormError("خطا در برقراری ارتباط با سرور.");
      setSending(false);
    }
  };

  if (loadError) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-sage">خطا در دریافت نقدها.</p>
        <button
          onClick={() => load()}
          className="mt-3 rounded-full border border-gold/40 px-5 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sage">
        <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
      </div>
    );
  }

  const maxBar = Math.max(1, ...Object.values(data.breakdown || {}));

  return (
    <div className="space-y-8">
      {/* ---------- rating summary ---------- */}
      <div className="grid gap-5 rounded-2xl glass-panel p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="text-center sm:border-l sm:border-gold/15 sm:pl-6">
          <p className="font-display text-5xl font-black text-gold">
            {data.count ? toFa(data.average.toFixed(1)) : "—"}
          </p>
          <div className="mt-1 flex justify-center">
            <Stars value={data.average} size={15} />
          </div>
          <p className="mt-1.5 text-[11px] text-sage">
            از مجموع {toFa(data.count)} نقد
          </p>
        </div>

        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const value = data.breakdown?.[star] ?? 0;
            return (
              <div key={star} className="flex items-center gap-2.5">
                <span className="flex w-9 items-center gap-0.5 text-[11px] font-bold text-sage">
                  {toFa(star)}
                  <Star size={10} className="text-gold" fill="currentColor" />
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-night/60">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(value / maxBar) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.05 * (5 - star) }}
                    className="h-full rounded-full bg-gradient-to-l from-gold to-gold-deep"
                  />
                </div>
                <span className="w-8 text-left text-[11px] text-sage">{toFa(value)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- review list ---------- */}
      <div className="space-y-4">
        {data.reviews.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gold/20 py-10 text-center text-sm text-sage">
            هنوز نقدی برای این محصول ثبت نشده — اولین نفر باشید!
          </p>
        )}

        {data.reviews.map((review, index) => (
          <ReviewCard key={review.id} review={review} index={index} />
        ))}
      </div>

      {/* ---------- submit form ---------- */}
      <div className="gold-ring rounded-2xl glass-panel p-5">
        <div className="flex items-center gap-2 text-gold">
          <MessageCircle size={16} />
          <h3 className="text-sm font-black">نقد خود را بنویسید</h3>
        </div>

        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-200"
            >
              <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold">{sent}</p>
                <button
                  onClick={() => setSent("")}
                  className="mt-2 text-[11px] font-bold text-emerald-300 underline"
                >
                  نوشتن نقد دیگر
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-sage">نام شما</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مانند: مهدیه زمانی"
                    className="w-full rounded-xl glass-input px-3.5 py-2.5 text-sm text-cream placeholder:text-sage/40 focus:border-gold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-sage">امتیاز شما</label>
                  <div className="flex h-[42px] items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        aria-label={`امتیاز ${n}`}
                        className="transition-transform hover:scale-115 active:scale-95"
                      >
                        <Star
                          size={22}
                          className={n <= rating ? "text-gold" : "text-sage/30"}
                          fill={n <= rating ? "currentColor" : "none"}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="mt-3 mb-1 block text-[11px] font-bold text-sage">متن نقد</label>
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="تجربه‌تان از رایحه، ماندگاری و بسته‌بندی را بنویسید…"
                className="w-full rounded-xl glass-input px-3.5 py-2.5 text-sm leading-7 text-cream placeholder:text-sage/40 focus:border-gold"
              />

              {formError && <p className="mt-2 text-xs text-red-400">{formError}</p>}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10.5px] leading-6 text-sage/80">
                  نقدها پس از بررسی مدیر منتشر می‌شوند.
                  {!user && " با ورود به حساب، نشان «خرید تأییدشده» می‌گیرید."}
                </p>
                <button
                  onClick={submit}
                  disabled={sending || body.trim().length < 10 || name.trim().length < 2}
                  className="shimmer-btn flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-black text-[#241a05] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {sending ? "در حال ارسال…" : "ارسال نقد"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ReviewCard({ review, index }: { review: Review; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.3) }}
      className="rounded-2xl glass-panel p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/25 bg-night text-xs font-black text-gold">
            {review.name.trim().slice(0, 1)}
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-cream">
              {review.name}
              {review.verifiedBuyer && (
                <span className="flex items-center gap-0.5 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                  <ShieldCheck size={10} /> خرید تأییدشده
                </span>
              )}
            </p>
            <p className="text-[10.5px] text-sage">{fmtDate(review.createdAt)}</p>
          </div>
        </div>
        <Stars value={review.rating} />
      </header>

      <p className="mt-3 text-[13.5px] leading-8 whitespace-pre-line text-cream/85">{review.body}</p>

      {review.reply && (
        <div className="mt-4 rounded-xl border-r-2 border-gold/60 glass-soft p-3.5 sm:mr-6">
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-gold">
            {review.reply.author}
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9.5px] text-emerald-300">
              مدیر سایت
            </span>
            {review.reply.at && (
              <span className="text-[10px] font-normal text-sage">{fmtDate(review.reply.at)}</span>
            )}
          </p>
          <p className="mt-2 text-[13px] leading-7 whitespace-pre-line text-sage">
            {review.reply.body}
          </p>
        </div>
      )}
    </motion.article>
  );
}
