"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Send,
  Search,
  Users,
  UserCheck,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Mail,
  History,
} from "lucide-react";
import { toFa } from "@/lib/data";

/* ==================================================================== */
/*  اطلاع‌رسانی به مشتریان                                             */
/*  Send one announcement e-mail either to every customer or to a       */
/*  hand-picked list, and review what was sent before.                  */
/* ==================================================================== */

type Recipient = { id: string; name: string; email: string; phone: string };

type Campaign = {
  id: string;
  subject: string;
  body: string;
  audience: "all" | "selected";
  total: number;
  sent: number;
  failed: number;
  sampleRecipients: string[];
  lastError: string;
  sentByLabel: string;
  createdAt: string;
};

const inputCls =
  "glass-input w-full rounded-xl px-3.5 py-2.5 text-sm text-cream placeholder:text-sage/40 focus:outline-none";

export default function NotificationsAdmin() {
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<Recipient[] | null>(null);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  /* ---------------- data ---------------- */
  const loadPeople = useCallback(async (term: string, signal?: AbortSignal) => {
    try {
      const qs = term.trim() ? `?search=${encodeURIComponent(term.trim())}` : "";
      const res = await fetch(`/api/admin/notifications/recipients${qs}`, { signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "خطا در دریافت فهرست مشتریان.");
        return;
      }
      setPeople(data.recipients || []);
      setTotalCustomers(Number(data.total) || 0);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError("خطا در ارتباط با سرور.");
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications/history");
      const data = await res.json().catch(() => null);
      if (res.ok) setHistory(data?.campaigns || []);
    } catch {
      /* the history block is optional — never block the form on it */
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    // Debounced search so typing does not fire a request per keystroke.
    const t = setTimeout(() => loadPeople(search, ctrl.signal), search ? 350 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [search, loadPeople]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /* ---------------- helpers ---------------- */
  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const visibleIds = useMemo(() => (people || []).map((p) => p.id), [people]);
  const allVisiblePicked =
    visibleIds.length > 0 && visibleIds.every((id) => picked.includes(id));

  const toggleAllVisible = () =>
    setPicked((prev) =>
      allVisiblePicked
        ? prev.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...prev, ...visibleIds]))
    );

  const send = async () => {
    setError("");
    setDone("");
    if (subject.trim().length < 3) {
      setError("موضوع پیام را بنویسید.");
      return;
    }
    if (body.trim().length < 10) {
      setError("متن پیام خیلی کوتاه است.");
      return;
    }
    if (audience === "selected" && picked.length === 0) {
      setError("دست‌کم یک مشتری را انتخاب کنید.");
      return;
    }
    const targetCount = audience === "all" ? totalCustomers : picked.length;
    if (
      !window.confirm(
        `این پیام برای ${toFa(targetCount)} مشتری ایمیل می‌شود. مطمئنید؟`
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          audience,
          userIds: audience === "selected" ? picked : [],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "ارسال پیام ناموفق بود.");
        // The server records failed campaigns too; refresh so the diagnostic is
        // immediately visible in history instead of only after a page reload.
        if (data?.campaign) loadHistory();
        return;
      }
      setDone(
        `پیام برای ${toFa(data.sent)} مشتری فرستاده شد` +
          (data.failed ? ` و ${toFa(data.failed)} مورد ناموفق بود.` : ".")
      );
      setSubject("");
      setBody("");
      setPicked([]);
      loadHistory();
    } catch {
      setError("خطا در ارتباط با سرور.");
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- view ---------------- */
  return (
    <div className="max-w-3xl">
      <header>
        <h1 className="text-xl font-black text-cream sm:text-2xl">اطلاع‌رسانی به مشتریان</h1>
        <p className="mt-1 text-xs text-sage">
          ارسال ایمیل همگانی یا انتخابی؛ برای مثال خبر جشنواره، محصول جدید یا پیام تشکر.
        </p>
      </header>

      <AnimatePresence>
        {(error || done) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs leading-6 ${
              error
                ? "border-red-400/40 bg-red-400/10 text-red-200"
                : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
            }`}
          >
            {error ? (
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            )}
            <span>{error || done}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- audience ---------- */}
      <section className="gold-ring glass-panel mt-6 rounded-2xl p-4 sm:p-5">
        <h2 className="text-sm font-black text-gold-soft">گیرندگان</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["all", "همه‌ی مشتریان", Users],
              ["selected", "انتخاب دستی", UserCheck],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAudience(key)}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-colors ${
                audience === key
                  ? "border border-gold/60 bg-gold/15 text-gold"
                  : "border border-gold/20 text-sage hover:text-cream"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-sage">
          {audience === "all"
            ? `پیام به ${toFa(totalCustomers)} مشتری دارای ایمیل فرستاده می‌شود (حداکثر ۵۰۰ نفر در هر ارسال).`
            : `${toFa(picked.length)} مشتری انتخاب شده است.`}
        </p>

        {audience === "selected" && (
          <div className="mt-4">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sage/60"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جست‌وجوی نام، ایمیل یا شماره…"
                className={`${inputCls} pr-9`}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-sage">
              <button type="button" onClick={toggleAllVisible} className="underline">
                {allVisiblePicked ? "برداشتن انتخاب این فهرست" : "انتخاب همه‌ی این فهرست"}
              </button>
              {picked.length > 0 && (
                <button type="button" onClick={() => setPicked([])} className="underline">
                  پاک کردن انتخاب‌ها
                </button>
              )}
            </div>

            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pl-1">
              {people === null ? (
                <p className="flex items-center gap-2 py-4 text-xs text-sage">
                  <Loader2 size={14} className="animate-spin" /> در حال بارگذاری…
                </p>
              ) : people.length === 0 ? (
                <p className="py-4 text-xs text-sage">مشتری‌ای پیدا نشد.</p>
              ) : (
                people.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition-colors ${
                        on ? "border border-gold/50 bg-gold/10" : "border border-gold/15"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(p.id)}
                        className="h-4 w-4 shrink-0 accent-[#d4af37]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-cream">{p.name || "—"}</span>
                        <span dir="ltr" className="block truncate text-[10.5px] text-sage">
                          {p.email}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>

      {/* ---------- message ---------- */}
      <section className="gold-ring glass-panel mt-4 rounded-2xl p-4 sm:p-5">
        <h2 className="text-sm font-black text-gold-soft">متن اطلاعیه</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-sage">موضوع ایمیل</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={160}
              placeholder="مثلاً: جشنواره‌ی پایان تابستان بلا"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-sage">متن پیام</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              maxLength={8000}
              placeholder={"سلام…\n\nهر خط خالی یک پاراگراف تازه می‌سازد."}
              className={`${inputCls} resize-none leading-7`}
            />
            <p className="mt-1 text-[10px] text-sage/70">
              نام مشتری به‌صورت خودکار در ابتدای ایمیل نوشته می‌شود.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="btn-sky mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {busy ? "در حال ارسال…" : "ارسال اطلاعیه"}
        </button>
      </section>

      {/* ---------- history ---------- */}
      <section className="gold-ring glass-panel mt-4 rounded-2xl p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-black text-gold-soft">
          <History size={15} /> اطلاعیه‌های فرستاده‌شده
        </h2>
        {history.length === 0 ? (
          <p className="mt-3 text-xs text-sage">هنوز اطلاعیه‌ای فرستاده نشده است.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((c) => (
              <li key={c.id} className="rounded-xl border border-gold/15 px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-xs font-bold text-cream">{c.subject}</p>
                  <span className="shrink-0 text-[10px] text-sage">
                    {new Date(c.createdAt).toLocaleDateString("fa-IR")}
                  </span>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-sage">
                  <span className="flex items-center gap-1">
                    <Mail size={11} />
                    {c.audience === "all" ? "همگانی" : "انتخابی"}
                  </span>
                  <span>ارسال‌شده: {toFa(c.sent)}</span>
                  {c.failed > 0 && (
                    <span className="text-red-300">ناموفق: {toFa(c.failed)}</span>
                  )}
                </p>
                {c.failed > 0 && c.lastError && (
                  <p className="mt-1.5 rounded-lg bg-red-400/10 px-2.5 py-1.5 text-[10px] leading-5 text-red-200">
                    {c.lastError}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
