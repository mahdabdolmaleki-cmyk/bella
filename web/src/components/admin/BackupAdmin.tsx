"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  Upload,
  FileArchive,
  Images,
  RotateCcw,
} from "lucide-react";

type CollectionStat = { name: string; count: number };
type Summary = {
  database: string;
  generatedAt: string;
  collections: CollectionStat[];
  totalDocuments: number;
  uploadFiles: number;
  uploadBytes: number;
};
type RestoreResult = {
  restoredAt: string;
  documents: number;
  collections: number;
  uploadFiles: number;
  uploadBytes: number;
};

const LABELS: Record<string, string> = {
  products: "محصولات",
  orders: "سفارش‌ها",
  users: "مشتریان",
  sessions: "نشست‌ها",
  otps: "کدهای یک‌بارمصرف",
  reviews: "نقد و بررسی‌ها",
  messages: "پیام‌های تماس",
  settings: "تنظیمات سایت",
  counters: "شمارنده‌ها",
  visits: "بازدیدها",
  campaigns: "کمپین‌ها",
  tutorials: "مطالب آموزشی",
  tutorialcomments: "دیدگاه‌های آموزشی",
  tutorialvotes: "رأی‌های آموزشی",
};

const fa = (value: number) => value.toLocaleString("fa-IR");
function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "۰ بایت";
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const amount = value / 1024 ** index;
  return `${amount.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ${units[index]}`;
}

export default function BackupAdmin() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/backup/summary", { cache: "no-store" });
      if (res.status === 403) {
        setError("فقط مالک فروشگاه به پشتیبان‌گیری دسترسی دارد.");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "دریافت وضعیت پشتیبان ممکن نشد.");
        return;
      }
      setSummary(data);
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startRestore = () => {
    if (!file || restoring) return;
    const accepted = window.confirm(
      "تمام داده‌های فعلی MongoDB و تمام عکس‌ها و ویدئوهای فعلی حذف و با محتوای این بکاپ جایگزین می‌شوند. این عملیات قابل بازگشت نیست. ادامه می‌دهید؟",
    );
    if (!accepted) return;

    setRestoring(true);
    setRestoreProgress(0);
    setRestoreResult(null);
    setError("");

    const body = new FormData();
    body.append("backup", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/backup/restore");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setRestoreProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let data: (RestoreResult & { ok?: boolean; error?: string }) | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // A non-JSON server response becomes the generic error below.
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
        setRestoreResult(data);
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        void load();
      } else {
        setError(data?.error || "بازیابی فایل پشتیبان ناموفق بود.");
      }
      setRestoring(false);
    };
    xhr.onerror = () => {
      setError("ارتباط هنگام بارگذاری یا بازیابی قطع شد.");
      setRestoring(false);
    };
    xhr.send(body);
  };

  return (
    <div className="max-w-5xl pb-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-cream">پشتیبان‌گیری و بازیابی کامل</h1>
          <p className="mt-1 text-xs leading-6 text-sage">
            یک بسته شامل تمام داده‌های MongoDB، ایندکس‌ها، عکس‌ها و ویدئوهای آپلودی
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || restoring}
          className="flex items-center gap-1.5 rounded-xl border border-gold/25 px-3 py-2 text-xs font-bold text-gold-soft disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          به‌روزرسانی وضعیت
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-xs leading-6 text-red-300">
          <ShieldAlert size={17} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {restoreResult && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-xs leading-6 text-emerald-200">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          <p>
            بازیابی کامل شد: {fa(restoreResult.documents)} رکورد در{" "}
            {fa(restoreResult.collections)} مجموعه و {fa(restoreResult.uploadFiles)} فایل جایگزین شد.
          </p>
        </div>
      )}

      {loading && !summary ? (
        <div className="mt-8 flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بررسی اطلاعات فعلی…
        </div>
      ) : summary ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gold/15 glass-panel p-4">
              <Database size={18} className="text-gold" />
              <p className="mt-3 text-[11px] text-sage">رکوردهای MongoDB</p>
              <p className="mt-1 text-xl font-black text-cream">{fa(summary.totalDocuments)}</p>
            </div>
            <div className="rounded-2xl border border-sky-300/15 glass-panel p-4">
              <Images size={18} className="text-sky-300" />
              <p className="mt-3 text-[11px] text-sage">فایل‌های آپلودی</p>
              <p className="mt-1 text-xl font-black text-cream">{fa(summary.uploadFiles)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-300/15 glass-panel p-4">
              <FileArchive size={18} className="text-emerald-300" />
              <p className="mt-3 text-[11px] text-sage">حجم عکس‌ها و ویدئوها</p>
              <p className="mt-1 text-lg font-black text-cream">{formatBytes(summary.uploadBytes)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="gold-ring rounded-3xl glass-panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-black text-gold">
                  <Database size={16} /> محتوای دیتابیس فعلی
                </h2>
                <span dir="ltr" className="font-mono text-[10px] text-sage">
                  {summary.database}
                </span>
              </div>
              <div className="mt-3 max-h-80 space-y-1 overflow-y-auto pl-1">
                {summary.collections.map((collection) => (
                  <div
                    key={collection.name}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs odd:bg-gold/[0.035]"
                  >
                    <span className="text-cream/90">
                      {LABELS[collection.name] ?? collection.name}
                      <span dir="ltr" className="ms-2 font-mono text-[9px] text-sage/50">
                        {collection.name}
                      </span>
                    </span>
                    <span className="text-sage">{fa(collection.count)} رکورد</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="gold-ring rounded-3xl glass-panel p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-black text-sky-200">
                <Download size={16} /> دریافت بکاپ کامل
              </h2>
              <p className="mt-2 text-[11px] leading-6 text-sage">
                فایل خروجی با فرمت <span dir="ltr" className="font-mono">.tar.gz</span> شامل
                Extended JSON دقیق MongoDB، تمام ایندکس‌ها و کل پوشهٔ uploads است.
              </p>
              <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-[10px] leading-5 text-amber-100/80">
                این فایل شامل اطلاعات شخصی مشتریان و داده‌های حساس فروشگاه است؛ آن را فقط در
                فضای رمزگذاری‌شده نگه دارید.
              </div>
              <a
                href="/api/admin/backup/export"
                onClick={() => {
                  setDownloadStarted(true);
                  window.setTimeout(() => setDownloadStarted(false), 5000);
                }}
                className="btn-sky mt-4 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-xs font-black"
              >
                <Download size={15} /> ساخت و دانلود بکاپ کامل
              </a>
              {downloadStarted && (
                <p className="mt-2 text-center text-[10px] text-sky-200">
                  ساخت بسته آغاز شد؛ برای دیتای بزرگ کمی منتظر بمانید.
                </p>
              )}
            </section>
          </div>
        </>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-3xl border border-red-400/25 bg-red-500/[0.035]">
        <div className="border-b border-red-400/15 px-4 py-4 sm:px-5">
          <h2 className="flex items-center gap-2 text-sm font-black text-red-300">
            <RotateCcw size={16} /> بازیابی و جایگزینی کامل
          </h2>
          <p className="mt-1.5 text-[11px] leading-6 text-sage">
            ابتدا فایل کاملاً اعتبارسنجی و در فضای موقت آماده می‌شود. فقط پس از موفقیت همهٔ
            بررسی‌ها، دیتابیس و uploads فعلی با محتوای بکاپ جایگزین می‌شوند.
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="rounded-2xl border border-dashed border-red-300/25 p-4">
            <input
              ref={fileRef}
              type="file"
              accept=".tar.gz,.tgz,application/gzip"
              disabled={restoring}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setRestoreResult(null);
                setError("");
              }}
              className="block w-full text-xs text-sage file:ml-3 file:rounded-full file:border-0 file:bg-red-400/15 file:px-4 file:py-2 file:font-bold file:text-red-200"
            />
            {file && (
              <p className="mt-2 text-[10px] text-sage">
                فایل انتخاب‌شده: <span dir="ltr">{file.name}</span> — {formatBytes(file.size)}
              </p>
            )}
          </div>

          {restoring && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[10px] text-sage">
                <span>بارگذاری و آماده‌سازی بازیابی…</span>
                <span>{fa(restoreProgress)}٪</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-night/70">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-red-400 to-amber-300 transition-[width]"
                  style={{ width: `${restoreProgress}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={startRestore}
            disabled={!file || restoring}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-red-500 px-5 py-3 text-xs font-black text-white disabled:opacity-40"
          >
            {restoring ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {restoring ? "در حال بازیابی؛ صفحه را نبندید…" : "بارگذاری و جایگزینی کامل داده‌ها"}
          </button>

          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-5 text-red-200/80">
            <ShieldAlert size={13} className="mt-0.5 shrink-0" />
            پس از تأیید نهایی، تمام collectionها و فایل‌های فعلی با محتوای همان بکاپ جایگزین
            می‌شوند؛ هیچ collection برنامه از نسخهٔ کامل حذف نمی‌شود.
          </p>
        </div>
      </section>
    </div>
  );
}
