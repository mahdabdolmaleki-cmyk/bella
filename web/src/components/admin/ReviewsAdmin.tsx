"use client";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Check,
  X,
  Trash2,
  Reply,
  Loader2,
  Search,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { toFa } from "@/lib/data";
import type { AdminReview, ReviewStatus } from "@/lib/types";

/* ==================================================================== */
/*  مدیریت نقد و بررسی‌ها                                             */
/*  Approve / reject, answer the customer, or delete a review.           */
/* ==================================================================== */

const FILTERS: Array<{ key: ReviewStatus | "all"; label: string }> = [
  { key: "pending", label: "در انتطار تأیید" },
  { key: "approved", label: "تأییدشده" },
  { key: "rejected", label: "ردشده" },
  { key: "all", label: "همه" },
];

const STATUS_STYLE: Record<ReviewStatus, string> = {
  pending: "border-gold/40 bg-gold/10 text-gold-soft",
  approved: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  rejected: "border-red-400/40 bg-red-400/10 text-red-300",
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "در انتطار",
  approved: "منتشرشده",
  rejected: "ردشده",
};

export default function ReviewsAdmin() {
  const [filter, setFilter] = useState<ReviewStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminReview[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setError("");
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (search.trim()) params.set("search", search.trim());
      try {
        const res = await fetch(`/api/admin/reviews?${params.toString()}`, { signal });
        if (!res.ok) {
          setError("خطا در دریافت نقدها.");
          return;
        }
        const data = await res.json();
        setRows(data.reviews ?? []);
        setPendingCount(data.pendingCount ?? 0);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setError("خطا در برقراری ارتباط با سرور.");
        }
      }
    },
    [filter, search],
  );

  // Debounced so typing in the search box does not hammer the API.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => load(ctrl.signal), search ? 350 : 0);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [load, search]);

  const patch = async (id: number, payload: Record<string, unknown>) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "ذخیره تغییر انجام نشد.");
        setBusyId(null);
        return;
      }
      setRows((list) => {
        if (!list) return list;
        // When a filter is active and the new status no longer matches it,
        // drop the row so the queue always reflects the chosen filter.
        const updated: AdminReview = data.review;
        if (filter !== "all" && updated.status !== filter) {
          return list.filter((r) => r.id !== id);
        }
        return list.map((r) => (r.id === id ? updated : r));
      });
      if (payload.status === "pending") setPendingCount((n) => n + 1);
      else if (payload.status) setPendingCount((n) => Math.max(0, n - 1));
      setReplyFor(null);
      setReplyText("");
      setBusyId(null);
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
      setBusyId(null);
    }
  };

  const remove = async (row: AdminReview) => {
    if (!confirm(`نقد «${row.name}» برای همیشه حذف شود؟`)) return;
    setBusyId(row.id);
    const res = await fetch(`/api/admin/reviews/${row.id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((list) => (list ? list.filter((r) => r.id !== row.id) : list));
      if (row.status === "pending") setPendingCount((n) => Math.max(0, n - 1));
    } else {
      setError("حذف نقد انجام نشد.");
    }
    setBusyId(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-cream">نقد و بررسی‌ها</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-sage">
            <Clock size={13} />
            {toFa(pendingCount)} نقد در انتطار تأیید
          </p>
        </div>

        <label className="flex items-center gap-2 rounded-full glass-panel px-3.5 py-2">
          <Search size={14} className="text-sage" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در نام یا متن نقد…"
            className="w-44 bg-transparent text-xs text-cream placeholder:text-sage/50 focus:outline-none sm:w-56"
          />
        </label>
      </div>

      {/* ---------- status filter ---------- */}
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-4 py-1.5 text-[11.5px] font-bold transition-colors ${
              filter === f.key
                ? "border-gold bg-gold/15 text-gold"
                : "border-gold/20 text-sage hover:border-gold/40"
            }`}
          >
            {f.label}
            {f.key === "pending" && pendingCount > 0 && (
              <span className="mr-1.5 rounded-full bg-gold px-1.5 text-[10px] text-[#241a05]">
                {toFa(pendingCount)}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      {!rows ? (
        <div className="mt-8 flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-gold/20 py-12 text-center text-sm text-sage">
          نقدی با این فیلتر وجود ندارد.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.article
                key={row.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25 }}
                className="gold-ring rounded-2xl glass-panel p-4"
              >
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-cream">{row.name}</span>
                    {row.verifiedBuyer && (
                      <span className="flex items-center gap-0.5 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                        <ShieldCheck size={10} /> خرید تأییدشده
                      </span>
                    )}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${STATUS_STYLE[row.status]}`}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={13}
                        className={n <= row.rating ? "text-gold" : "text-sage/30"}
                        fill={n <= row.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </span>
                </header>

                <p className="mt-1 text-[11px] text-sage">
                  محصول: <span className="text-gold-soft">{row.productName}</span>
                  {" • "}
                  {new Date(row.createdAt).toLocaleDateString("fa-IR")}
                </p>

                <p className="mt-3 text-[13px] leading-7 whitespace-pre-line text-cream/85">
                  {row.body}
                </p>

                {row.reply && replyFor !== row.id && (
                  <div className="mt-3 rounded-xl border-r-2 border-gold/60 glass-soft p-3">
                    <p className="text-[11px] font-bold text-gold">پاسخ شما</p>
                    <p className="mt-1.5 text-[12.5px] leading-7 whitespace-pre-line text-sage">
                      {row.reply.body}
                    </p>
                  </div>
                )}

                {/* ---------- reply editor ---------- */}
                {replyFor === row.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3">
                    <textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="پاسخ شما به مشتری… (خالی بگذارید تا پاسخ حالی حذف شود)"
                      className="w-full rounded-xl glass-input px-3.5 py-2.5 text-sm leading-7 text-cream placeholder:text-sage/40 focus:border-gold focus:outline-none"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => patch(row.id, { reply: replyText })}
                        disabled={busyId === row.id}
                        className="btn-emerald rounded-full px-5 py-2 text-xs font-black disabled:opacity-60"
                      >
                        {busyId === row.id ? "در حال ذخیره…" : "ذخیره پاسخ"}
                      </button>
                      <button
                        onClick={() => {
                          setReplyFor(null);
                          setReplyText("");
                        }}
                        className="rounded-full border border-gold/25 px-5 py-2 text-xs font-bold text-sage hover:bg-gold/5"
                      >
                        انصراف
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ---------- actions ---------- */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gold/10 pt-3">
                  {row.status !== "approved" && (
                    <button
                      onClick={() => patch(row.id, { status: "approved" })}
                      disabled={busyId === row.id}
                      className="flex items-center gap-1 rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      <Check size={13} /> تأیید و انتشار
                    </button>
                  )}
                  {row.status !== "rejected" && (
                    <button
                      onClick={() => patch(row.id, { status: "rejected" })}
                      disabled={busyId === row.id}
                      className="flex items-center gap-1 rounded-lg border border-gold/25 px-3 py-2 text-xs font-bold text-sage hover:bg-gold/10 disabled:opacity-50"
                    >
                      <X size={13} /> رد کردن
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setReplyFor(replyFor === row.id ? null : row.id);
                      setReplyText(row.reply?.body || "");
                    }}
                    className="flex items-center gap-1 rounded-lg border border-gold/25 px-3 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
                  >
                    <Reply size={13} /> {row.reply ? "ویرایش پاسخ" : "پاسخ دادن"}
                  </button>
                  <button
                    onClick={() => remove(row)}
                    disabled={busyId === row.id}
                    className="flex items-center gap-1 rounded-lg border border-red-400/25 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> حذف
                  </button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
