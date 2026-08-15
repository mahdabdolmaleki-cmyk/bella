"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Database,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  FileJson,
  Archive,
  Check,
} from "lucide-react";

type CollectionStat = { name: string; count: number };

type Summary = {
  database: string;
  generatedAt: string;
  collections: CollectionStat[];
  totalDocuments: number;
};

// Friendly Persian names for the collections we know about. Anything not in
// this map falls back to its raw name, so a new collection still shows up in
// the list instead of disappearing from the backup summary.
const LABELS: Record<string, string> = {
  products: "محصولات",
  orders: "سفارش‌ها",
  users: "مشتریان",
  adminusers: "حساب‌های مدیریتی",
  reviews: "نقد و بررسی‌ها",
  messages: "پیام‌های تماس",
  settings: "تنظیمات سایت",
  otps: "کدهای یک‌بارمصرف",
  counters: "شمارنده‌ها",
  visits: "بازدیدها",
  campaigns: "کمپین‌ها",
};

const fa = (n: number) => n.toLocaleString("fa-IR");

export default function BackupAdmin() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [format, setFormat] = useState<"json" | "ndjson">("json");
  const [gzip, setGzip] = useState(true);
  const [secrets, setSecrets] = useState(false);
  const [started, setStarted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/backup/summary");
      if (res.status === 403) {
        setError("فقط مالک فروشگاه به پشتیبان‌گیری دسترسی دارد.");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error || "دریافت وضعیت پایگاه داده ممکن نشد.");
        return;
      }
      setSummary(await res.json());
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const params = new URLSearchParams({
    format,
    gzip: gzip ? "1" : "0",
    secrets: secrets ? "1" : "0",
  });
  const downloadUrl = `/api/admin/backup/export?${params.toString()}`;

  // A plain navigation is used instead of fetch()+Blob on purpose: the export is
  // streamed, so the browser can write it straight to disk. Buffering a whole
  // database into a Blob in memory would defeat the streaming server.
  const onDownload = () => {
    setStarted(true);
    window.setTimeout(() => setStarted(false), 4000);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-cream">پشتیبان‌گیری پایگاه داده</h1>
          <p className="mt-1 text-xs text-sage">
            خروجی کامل از تمام داده‌های فروشگاه — مخصوص مالک
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gold/25 px-3 py-2 text-xs font-bold text-gold-soft disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          به‌روزرسانی
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-xs text-red-300">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading && !summary && !error && (
        <div className="mt-6 flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      )}

      {summary && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          {/* ---------------- Contents ---------------- */}
          <section className="gold-ring rounded-3xl glass-panel p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-black text-gold">
                <Database size={16} /> محتوای پشتیبان
              </h2>
              <span dir="ltr" className="font-mono text-[10px] text-sage">
                {summary.database}
              </span>
            </div>

            <div className="mt-3 space-y-1">
              {summary.collections.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs odd:bg-gold/[0.03]"
                >
                  <span className="text-cream/90">
                    {LABELS[c.name] ?? c.name}
                    <span dir="ltr" className="ms-2 font-mono text-[10px] text-sage/60">
                      {c.name}
                    </span>
                  </span>
                  <span className="text-sage">{fa(c.count)} رکورد</span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex justify-between border-t border-gold/10 pt-3 text-xs font-bold">
              <span className="text-sage">مجموع رکوردها</span>
              <span className="text-gold-soft">{fa(summary.totalDocuments)}</span>
            </div>
          </section>

          {/* ---------------- Options ---------------- */}
          <section className="gold-ring rounded-3xl glass-panel p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-black text-gold">
              <Download size={16} /> دریافت خروجی
            </h2>

            <p className="mt-1 mb-3 text-[11px] font-bold text-sage">قالب فایل</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "json", label: "JSON", desc: "یک فایل یکپارچه" },
                  { key: "ndjson", label: "NDJSON", desc: "سازگار با mongoimport" },
                ] as const
              ).map((opt) => {
                const active = format === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setFormat(opt.key)}
                    className={`flex flex-col items-start gap-0.5 rounded-2xl border p-3 text-right transition-colors ${
                      active
                        ? "border-gold bg-gold/10"
                        : "border-gold/15 hover:border-gold/40"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-bold text-cream">
                      <FileJson size={14} className="text-gold/70" />
                      {opt.label}
                      {active && <Check size={12} className="text-gold" />}
                    </span>
                    <span className="text-[10px] text-sage">{opt.desc}</span>
                  </button>
                );
              })}
            </div>

            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-2xl border border-gold/15 p-3">
              <input
                type="checkbox"
                checked={gzip}
                onChange={(e) => setGzip(e.target.checked)}
                className="mt-0.5 accent-[#d4af37]"
              />
              <span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-cream">
                  <Archive size={13} className="text-gold/70" /> فشرده‌سازی (gz)
                </span>
                <span className="mt-0.5 block text-[10px] text-sage">
                  حجم فایل را به مقدار قابل توجهی کاهش می‌دهد.
                </span>
              </span>
            </label>

            <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-2xl border border-red-400/25 bg-red-500/[0.04] p-3">
              <input
                type="checkbox"
                checked={secrets}
                onChange={(e) => setSecrets(e.target.checked)}
                className="mt-0.5 accent-[#ef4444]"
              />
              <span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-red-300">
                  <ShieldAlert size={13} /> شامل داده‌های حساس
                </span>
                <span className="mt-0.5 block text-[10px] text-sage">
                  هش رمز عبور، کدهای تأیید و IP کاربران. فقط وقتی لازم است که
                  بخواهید بعداً دقیقاً همین وضعیت را بازگردانید. این فایل را جای
                  ناامن نگه ندارید.
                </span>
              </span>
            </label>

            <a
              href={downloadUrl}
              onClick={onDownload}
              className="btn-sky mt-4 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-xs font-black"
            >
              <Download size={15} />
              دانلود پشتیبان کامل
            </a>

            {started && (
              <p className="mt-2 text-center text-[10px] text-gold-soft">
                دانلود آغاز شد. برای دیتابیس بزرگ ممکن است کمی طول بکشد.
              </p>
            )}

            <p className="mt-3 text-[10px] leading-5 text-sage/80">
              خروجی به‌صورت جریانی ساخته می‌شود، بنابراین حجم دیتابیس حافظه سرور را
              پر نمی‌کند. هر دریافت پشتیبان در لاگ فعالیت‌ها ثبت می‌شود.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
