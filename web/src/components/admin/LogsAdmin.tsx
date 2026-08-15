"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Search,
  Globe,
  Trash2,
  ShieldAlert,
  HardDrive,
  Flame,
  Info,
} from "lucide-react";

export type ActivityLogRow = {
  id: string;
  at: string;
  level: "critical" | "important" | "routine";
  action: string;
  actorType: "admin" | "user" | "guest";
  actorLabel: string;
  target: string;
  method: string;
  path: string;
  status: number;
  success: boolean;
  ip: string;
  userAgent: string;
  meta: string;
};

const ACTOR_LABEL: Record<string, string> = {
  admin: "مدیر",
  user: "کاربر",
  guest: "مهمان",
};

const LEVEL_LABEL: Record<string, string> = {
  critical: "حساس",
  important: "مهم",
  routine: "عادی",
};

const ACTION_LABEL: Record<string, string> = {
  "admin.login": "ورود مدیر",
  "admin.login.failed": "ورود ناموفق مدیر",
  "admin.login.locked": "قفل شدن حساب مدیر",
  "admin.logout": "خروج مدیر",
  "admin.create": "ساخت حساب مدیریتی",
  "admin.update": "ویرایش حساب مدیریتی",
  "admin.delete": "حذف حساب مدیریتی",
  "admin.recover": "بازیابی رمز مدیر",
  "admin.recover.failed": "بازیابی ناموفق رمز مدیر",
  "otp.admin-reset.request": "درخواست کد بازیابی مدیر",
  "customer.create": "ساخت مشتری",
  "customer.update": "ویرایش مشتری",
  "customer.delete": "حذف مشتری",
  "user.register": "ثبت‌نام کاربر",
  "user.login": "ورود کاربر",
  "user.login.failed": "ورود ناموفق کاربر",
  "user.logout": "خروج کاربر",
  "user.password.reset": "بازنشانی رمز کاربر",
  "product.create": "افزودن محصول",
  "product.update": "ویرایش محصول",
  "product.delete": "حذف محصول",
  "order.create": "ثبت سفارش",
  "order.status": "تغییر وضعیت سفارش",
  "payment.paid": "پرداخت موفق",
  "payment.cancelled": "انصراف از پرداخت",
  "payment.request.failed": "خطا در شروع پرداخت",
  "payment.verify.failed": "خطا در تأیید پرداخت",
  "contact.create": "پیام تماس",
  "review.delete": "حذف نقد و بررسی",
  "notify.send": "ارسال اطلاع‌رسانی",
  "settings.update": "ویرایش تنظیمات",
  "upload.create": "آپلود تصویر",
  "upload.rejected": "آپلود ردشده",
  "log.purge": "پاک‌سازی لاگ",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fa-IR", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function LogsAdmin({ canPurge }: { canPurge: boolean }) {
  const [logs, setLogs] = useState<ActivityLogRow[] | null>(null);
  const [retentionDays, setRetentionDays] = useState(30);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ critical: 0, important: 0, failed: 0 });
  const [search, setSearch] = useState("");
  const [actorType, setActorType] = useState("");
  const [level, setLevel] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (actorType) params.set("actorType", actorType);
      if (level) params.set("level", level);
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
      setCounts({
        critical: data.counts?.critical ?? 0,
        important: data.counts?.important ?? 0,
        failed: data.counts?.failed ?? 0,
      });
      setRetentionDays(data.retentionDays ?? 30);
    } catch {
      setError("خطا در دریافت لاگ‌ها.");
      setLogs([]);
    }
  }, [search, actorType, level]);

  // PERF: `load` changes on every keystroke of the search box, so this used to
  // fire one request per character typed. Debounced to 400ms.
  useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [load]);

  const purge = async () => {
    if (!confirm("همهٔ فایل‌های لاگ پاک شوند؟")) return;
    try {
      const res = await fetch("/api/admin/logs", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "پاک‌سازی ناموفق بود.");
        return;
      }
      load();
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    }
  };

  const chip = (id: string, label: string, active: boolean, onClick: () => void) => (
    <button
      key={id}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
        active
          ? "border-gold bg-gold/15 text-gold"
          : "border-gold/20 text-sage hover:border-gold/45 hover:text-gold-soft"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <h1 className="text-xl font-black text-cream">لاگ فعالیت‌ها</h1>
      <p className="mt-1 text-xs text-sage">
        فقط رویدادهای مهم (امنیتی، مالی، مدیریتی) و همهٔ تلاش‌های ناموفق ثبت
        می‌شوند و روی هر سطر آی‌پی درخواست‌کننده ثبت می‌شود.
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-sage">
        <HardDrive size={12} className="text-gold" />
        ذخیره‌سازی روی فایل سرور (پوشهٔ <code className="font-mono text-gold-soft">server/logs</code>)
        — هیچ لاگی در دیتابیس ذخیره نمی‌شود و فایل‌های قدیمی‌تر از{" "}
        {retentionDays.toLocaleString("fa-IR")} روز خودکار حذف می‌شوند.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-red-400/30 glass-soft p-3">
          <p className="text-[10.5px] text-sage">رویدادهای حساس</p>
          <p className="mt-1 text-base font-black text-red-300">
            {counts.critical.toLocaleString("fa-IR")}
          </p>
        </div>
        <div className="rounded-xl border border-gold/25 glass-soft p-3">
          <p className="text-[10.5px] text-sage">رویدادهای مهم</p>
          <p className="mt-1 text-base font-black text-gold">
            {counts.important.toLocaleString("fa-IR")}
          </p>
        </div>
        <div className="rounded-xl border border-amber-300/30 glass-soft p-3">
          <p className="text-[10.5px] text-sage">تلاش‌های ناموفق</p>
          <p className="mt-1 text-base font-black text-amber-300">
            {counts.failed.toLocaleString("fa-IR")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-sage/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جست‌وجو در رویداد، کاربر، آی‌پی یا مسیر"
            className="w-full rounded-xl glass-input px-4 py-2.5 pr-9 text-sm text-cream placeholder:text-sage/50 focus:border-gold focus:outline-none"
          />
        </div>
        <select
          value={actorType}
          onChange={(e) => setActorType(e.target.value)}
          className="rounded-xl glass-input px-3 py-2.5 text-xs text-cream focus:border-gold focus:outline-none"
        >
          <option value="">همهٔ نقش‌ها</option>
          <option value="admin">مدیر</option>
          <option value="user">کاربر</option>
          <option value="guest">مهمان</option>
        </select>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-full border border-gold/30 px-4 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
        >
          <RefreshCw size={14} /> به‌روزرسانی
        </button>
        {canPurge && (
          <button
            onClick={purge}
            className="flex items-center gap-1.5 rounded-full border border-red-400/30 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-400/10"
          >
            <Trash2 size={14} /> پاک‌سازی همه
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {chip("all", "همهٔ سطح‌ها", level === "", () => setLevel(""))}
        {chip("critical", "حساس", level === "critical", () => setLevel("critical"))}
        {chip("important", "مهم", level === "important", () => setLevel("important"))}
      </div>

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      {!logs ? (
        <div className="mt-6 flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : logs.length === 0 ? (
        <p className="mt-6 text-sm text-sage">لاگی برای نمایش وجود ندارد.</p>
      ) : (
        <>
          <p className="mt-4 text-[11px] text-sage">
            نمایش {logs.length.toLocaleString("fa-IR")} مورد از {total.toLocaleString("fa-IR")}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {logs.map((l) => (
              <div
                key={l.id}
                className={`rounded-xl border glass-soft p-3.5 ${
                  !l.success
                    ? "border-red-400/40"
                    : l.level === "critical"
                      ? "border-gold/40"
                      : "border-gold/15"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {!l.success ? (
                    <ShieldAlert size={14} className="text-red-400" />
                  ) : l.level === "critical" ? (
                    <Flame size={14} className="text-gold" />
                  ) : (
                    <Info size={14} className="text-sage" />
                  )}
                  <span className="text-sm font-bold text-cream">
                    {ACTION_LABEL[l.action] || l.action}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      l.level === "critical"
                        ? "border-gold/40 bg-gold/10 text-gold"
                        : "border-gold/20 text-sage"
                    }`}
                  >
                    {LEVEL_LABEL[l.level] || l.level}
                  </span>
                  <span className="rounded-full border border-gold/20 px-2 py-0.5 text-[10px] text-sage">
                    {ACTOR_LABEL[l.actorType] || l.actorType}
                  </span>
                  <span className="flex items-center gap-1 rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 font-mono text-[10px] text-sky-200">
                    <Globe size={11} /> {l.ip || "—"}
                  </span>
                  {l.status > 0 && (
                    <span className="font-mono text-[10px] text-sage">{l.status}</span>
                  )}
                  <span className="ms-auto text-[11px] text-sage">{fmtDate(l.at)}</span>
                </div>
                <p className="mt-1 text-[11px] text-gold-soft">{l.actorLabel}</p>
                <p className="mt-0.5 break-all font-mono text-[10px] text-sage">
                  {l.method} {l.path}
                  {l.target ? ` ← ${l.target}` : ""}
                  {l.meta ? ` (${l.meta})` : ""}
                </p>
                {l.userAgent && (
                  <p className="mt-0.5 truncate text-[10px] text-sage/70">{l.userAgent}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
