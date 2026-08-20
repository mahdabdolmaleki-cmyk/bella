"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Package,
  ShoppingBag,
  Users,
  TrendingUp,
  MessageSquare,
  Loader2,
  Eye,
  Star,
  Truck,
  Clock,
  CheckCircle2,
  XCircle,
  PackageCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import StatsCharts from "@/components/admin/StatsCharts";
import { formatToman, toFa } from "@/lib/data";
import type { Order } from "@/lib/types";

/* ---------------------------------------------------------------- types */

type CountRow = { status: string; count: number; total?: number };

type Summary = {
  timezone: string;
  generatedAt: string;
  orders: {
    total: number;
    today: number;
    last7: number;
    byStatus: CountRow[];
    byPayment: CountRow[];
  };
  revenue: {
    all: number;
    today: number;
    last7: number;
    last30: number;
    paidOrders: number;
  };
  messages: { total: number; today: number; last7: number };
  reviews: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    avgRating: number;
  };
  customers: { total: number; today: number; last30: number };
  products: {
    total: number;
    active: number;
    inactive: number;
    outOfStock: number;
    lowStock: number;
  };
  visits: { today: number; last7: number };
};

/* ------------------------------------------------------------- helpers */

/** Icon + colour for each order status, so the report is scannable. */
const STATUS_STYLE: Record<
  string,
  { icon: typeof Clock; tint: string; ring: string }
> = {
  "در انتظار تأیید": { icon: Clock, tint: "text-amber-300", ring: "border-amber-300/35" },
  "در حال آماده‌سازی": { icon: PackageCheck, tint: "text-sky-300", ring: "border-sky-300/35" },
  "ارسال شد": { icon: Truck, tint: "text-indigo-300", ring: "border-indigo-300/35" },
  "تحویل داده شد": { icon: CheckCircle2, tint: "text-emerald-300", ring: "border-emerald-300/35" },
  "لغو شد": { icon: XCircle, tint: "text-red-300", ring: "border-red-300/35" },
};

const ORDER_STATUS_ORDER = [
  "در انتظار تأیید",
  "در حال آماده‌سازی",
  "ارسال شد",
  "تحویل داده شد",
  "لغو شد",
];

function Section({
  title,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  icon: typeof Clock;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="gold-ring mt-4 rounded-2xl glass-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon size={16} className="text-gold" />
        <h2 className="text-sm font-black text-cream">{title}</h2>
        {href && (
          <Link href={href} className="ms-auto text-[11px] font-bold text-gold hover:text-gold-soft">
            مشاهدهٔ همه
          </Link>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One small number tile used across every report section. */
function Tile({
  label,
  value,
  hint,
  tint = "text-cream",
  ring = "border-gold/20",
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tint?: string;
  ring?: string;
  icon?: typeof Clock;
  href?: string;
}) {
  const body = (
    <div
      className={`h-full min-w-0 rounded-xl border ${ring} glass-soft p-3 transition-colors hover:border-gold/45`}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={14} className={tint} />}
        <p className="truncate text-[10.5px] text-sage">{label}</p>
      </div>
      <p className={`mt-1.5 truncate text-base font-black sm:text-lg ${tint}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-sage/80">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full min-w-0">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ---------------------------------------------------------------- page */

export default function AdminDashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [reloading, setReloading] = useState(false);

  const load = async () => {
    setReloading(true);
    try {
      // One aggregated report + the five newest orders. Nothing else is
      // downloaded, so the dashboard stays fast as the shop grows.
      const [sumRes, ordersRes] = await Promise.all([
        fetch("/api/admin/summary"),
        fetch("/api/admin/orders?limit=5"),
      ]);
      if ([sumRes, ordersRes].some((r) => r.status === 401)) {
        router.replace("/admin/login");
        return;
      }
      if (!sumRes.ok || !ordersRes.ok) {
        setError("خطا در دریافت اطلاعات.");
        return;
      }
      setError("");
      setSummary(await sumRes.json());
      setOrders(((await ordersRes.json()).orders ?? []).slice(0, 5));
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const statusCount = (status: string) =>
    summary?.orders.byStatus.find((r) => r.status === status)?.count ?? 0;
  const statusTotal = (status: string) =>
    summary?.orders.byStatus.find((r) => r.status === status)?.total ?? 0;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-black text-cream">داشبورد</h1>
          <p className="mt-1 text-sm text-sage">گزارش کامل وضعیت فروشگاه بلا پرفیوم</p>
        </div>
        <button
          onClick={load}
          disabled={reloading}
          className="ms-auto flex items-center gap-1.5 rounded-full border border-gold/30 px-4 py-2 text-[11px] font-bold text-gold-soft hover:bg-gold/10 disabled:opacity-60"
        >
          {reloading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          به‌روزرسانی
        </button>
      </div>

      {error ? (
        <p className="mt-6 text-sm text-red-400">{error}</p>
      ) : !summary || !orders ? (
        <div className="mt-6 flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : (
        <>
          {/* ---------------- خلاصهٔ کلی ---------------- */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="فروش محقق‌شده"
              value={formatToman(summary.revenue.all)}
              hint={`امروز: ${formatToman(summary.revenue.today)}`}
              tint="text-gold"
              ring="border-gold/35"
              icon={TrendingUp}
              href="/admin/orders"
            />
            <Tile
              label="کل سفارش‌ها"
              value={toFa(summary.orders.total)}
              hint={`امروز: ${toFa(summary.orders.today)} · ۷ روز: ${toFa(summary.orders.last7)}`}
              icon={ShoppingBag}
              href="/admin/orders"
            />
            <Tile
              label="مشتریان"
              value={toFa(summary.customers.total)}
              hint={`۳۰ روز اخیر: ${toFa(summary.customers.last30)}`}
              icon={Users}
              href="/admin/users"
            />
            <Tile
              label="بازدید امروز"
              value={toFa(summary.visits.today)}
              hint={`۷ روز اخیر: ${toFa(summary.visits.last7)}`}
              icon={Eye}
            />
          </div>

          {/* ---------------- سفارش‌ها به تفکیک وضعیت ---------------- */}
          <Section title="سفارش‌ها به تفکیک وضعیت" icon={ShoppingBag} href="/admin/orders">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {ORDER_STATUS_ORDER.map((status) => {
                const style = STATUS_STYLE[status];
                return (
                  <Tile
                    key={status}
                    label={status}
                    value={toFa(statusCount(status))}
                    hint={statusTotal(status) ? formatToman(statusTotal(status)) : "—"}
                    tint={style?.tint}
                    ring={style?.ring}
                    icon={style?.icon}
                    href="/admin/orders"
                  />
                );
              })}
            </div>
          </Section>

          {/* ---------------- درآمد ---------------- */}
          <Section title="گزارش فروش" icon={TrendingUp} href="/admin/orders">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="امروز" value={formatToman(summary.revenue.today)} tint="text-gold" />
              <Tile label="۷ روز اخیر" value={formatToman(summary.revenue.last7)} />
              <Tile label="۳۰ روز اخیر" value={formatToman(summary.revenue.last30)} />
              <Tile
                label="سفارش‌های پرداخت‌شده"
                value={toFa(summary.revenue.paidOrders)}
                icon={CheckCircle2}
                tint="text-emerald-300"
              />
            </div>
          </Section>

          {/* ---------------- نقد و بررسی و پیام‌ها ---------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="نقد و بررسی‌ها" icon={Star} href="/admin/reviews">
              <div className="grid grid-cols-2 gap-3">
                <Tile
                  label="در انتظار تأیید"
                  value={toFa(summary.reviews.pending)}
                  tint={summary.reviews.pending ? "text-amber-300" : "text-cream"}
                  ring={summary.reviews.pending ? "border-amber-300/45" : "border-gold/20"}
                  icon={Clock}
                  href="/admin/reviews"
                />
                <Tile
                  label="تأییدشده"
                  value={toFa(summary.reviews.approved)}
                  tint="text-emerald-300"
                  icon={CheckCircle2}
                  href="/admin/reviews"
                />
                <Tile
                  label="ردشده"
                  value={toFa(summary.reviews.rejected)}
                  tint="text-red-300"
                  icon={XCircle}
                  href="/admin/reviews"
                />
                <Tile
                  label="میانگین امتیاز"
                  value={summary.reviews.avgRating ? toFa(summary.reviews.avgRating) : "—"}
                  hint={`مجموع نظرات: ${toFa(summary.reviews.total)}`}
                  tint="text-gold"
                  icon={Star}
                />
              </div>
            </Section>

            <Section title="پیام‌های تماس" icon={MessageSquare} href="/admin/users">
              <div className="grid grid-cols-3 gap-3">
                <Tile label="کل پیام‌ها" value={toFa(summary.messages.total)} icon={MessageSquare} />
                <Tile
                  label="امروز"
                  value={toFa(summary.messages.today)}
                  tint={summary.messages.today ? "text-amber-300" : "text-cream"}
                />
                <Tile label="۷ روز اخیر" value={toFa(summary.messages.last7)} />
              </div>
            </Section>
          </div>

          {/* ---------------- محصولات و موجودی ---------------- */}
          <Section title="محصولات و موجودی" icon={Package} href="/admin/products">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="کل محصولات" value={toFa(summary.products.total)} icon={Package} href="/admin/products" />
              <Tile label="فعال" value={toFa(summary.products.active)} tint="text-emerald-300" icon={CheckCircle2} />
              <Tile
                label="رو به اتمام (۳ یا کمتر)"
                value={toFa(summary.products.lowStock)}
                tint={summary.products.lowStock ? "text-amber-300" : "text-cream"}
                ring={summary.products.lowStock ? "border-amber-300/45" : "border-gold/20"}
                icon={AlertTriangle}
                href="/admin/products"
              />
              <Tile
                label="ناموجود"
                value={toFa(summary.products.outOfStock)}
                tint={summary.products.outOfStock ? "text-red-300" : "text-cream"}
                ring={summary.products.outOfStock ? "border-red-300/45" : "border-gold/20"}
                icon={XCircle}
                href="/admin/products"
              />
            </div>
          </Section>

          {/* نمودارهای ستونی: روزانه / هفتگی / ماهانه */}
          <StatsCharts />

          <div className="mt-8">
            <h2 className="text-sm font-black text-gold">آخرین سفارش‌ها</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-gold/15">
              <table className="w-full min-w-[560px] text-right text-sm">
                <thead>
                  <tr className="border-b border-gold/15 glass-soft text-xs text-sage">
                    <th className="px-4 py-3 font-bold">کد سفارش</th>
                    <th className="px-4 py-3 font-bold">مشتری</th>
                    <th className="px-4 py-3 font-bold">مبلغ</th>
                    <th className="px-4 py-3 font-bold">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sage">
                        هنوز سفارشی ثبت نشده است.
                      </td>
                    </tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-gold/10 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-gold-soft">{o.code}</td>
                      <td className="px-4 py-3">{o.customerName}</td>
                      <td className="px-4 py-3">{formatToman(o.total)}</td>
                      <td className="px-4 py-3 text-xs text-sage">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
