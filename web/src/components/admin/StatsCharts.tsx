"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  ShoppingBag,
  Eye,
  Loader2,
  RefreshCw,
  PieChart,
} from "lucide-react";
import { formatToman, toFa } from "@/lib/data";
import type { StatsResponse, StatusCounts } from "@/lib/types";

/* ==================================================================== */
/*  نمودارهای ستونی داشبورد                                          */
/*  Bars are drawn with plain divs + framer-motion instead of pulling in  */
/*  a charting library, which keeps the admin bundle small.              */
/* ==================================================================== */

const RANGES = [
  { key: "daily", label: "روزانه" },
  { key: "weekly", label: "هفتگی" },
  { key: "monthly", label: "ماهانه" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];
type MetricKey = "revenue" | "orders" | "visits";

const METRICS: Array<{
  key: MetricKey;
  label: string;
  icon: typeof TrendingUp;
  from: string;
  to: string;
  format: (n: number) => string;
}> = [
  {
    key: "revenue",
    label: "فروش",
    icon: TrendingUp,
    from: "#d4af37",
    to: "#9a7b2a",
    format: (n) => formatToman(n),
  },
  {
    key: "orders",
    label: "تعداد سفارش",
    icon: ShoppingBag,
    from: "#7fd6a8",
    to: "#1a4630",
    format: (n) => `${toFa(n)} سفارش`,
  },
  {
    key: "visits",
    label: "بازدید",
    icon: Eye,
    from: "#8fd3ff",
    to: "#20516e",
    format: (n) => `${toFa(n)} بازدید`,
  },
];

/** Turns a bucket key into a short Persian axis label. */
function axisLabel(key: string, range: RangeKey) {
  // key is YYYY-MM-DD (daily / weekly) or YYYY-MM (monthly)
  try {
    if (range === "monthly") {
      const date = new Date(`${key}-01T12:00:00.000Z`);
      return new Intl.DateTimeFormat("fa-IR", { month: "short", year: "2-digit" }).format(date);
    }
    const date = new Date(`${key}T12:00:00.000Z`);
    const label = new Intl.DateTimeFormat("fa-IR", { month: "numeric", day: "numeric" }).format(date);
    return range === "weekly" ? `هفته ${label}` : label;
  } catch {
    return key;
  }
}

export default function StatsCharts() {
  const [range, setRange] = useState<RangeKey>("daily");
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [data, setData] = useState<StatsResponse | null>(null);
  const [statusCounts, setStatusCounts] = useState<StatusCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const [statsRes, countsRes] = await Promise.all([
          fetch(`/api/admin/stats?range=${range}`, { signal }),
          fetch("/api/admin/order-status-counts", { signal }),
        ]);
        if (!statsRes.ok || !countsRes.ok) {
          setError("خطا در دریافت آمار.");
          setLoading(false);
          return;
        }
        setData(await statsRes.json());
        setStatusCounts(await countsRes.json());
        setLoading(false);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError("خطا در برقراری ارتباط با سرور.");
        setLoading(false);
      }
    },
    [range],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const series = data?.series ?? [];
  const max = useMemo(
    () => Math.max(1, ...series.map((b) => Number(b[metric]) || 0)),
    [series, metric],
  );

  return (
    <section className="gold-ring mt-8 rounded-2xl glass-panel p-4 sm:p-5">
      {/* ---------- header: range + metric switches ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-gold">نمودار فروش و بازدید</h2>
          <p className="mt-0.5 text-[11px] text-sage">
            {active.label} — {RANGES.find((r) => r.key === range)?.label}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full glass-panel p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`relative rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition-colors ${
                  range === r.key ? "text-[#241a05]" : "text-sage hover:text-gold-soft"
                }`}
              >
                {range === r.key && (
                  <motion.span
                    layoutId="range-pill"
                    className="absolute inset-0 rounded-full bg-gold"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">{r.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => load()}
            title="به‌روزرسانی"
            className="rounded-full border border-gold/25 p-2 text-sage hover:bg-gold/10 hover:text-gold"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ---------- metric tabs ---------- */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {METRICS.map((m) => {
          const Icon = m.icon;
          const total =
            m.key === "revenue"
              ? data?.totals.rangeRevenue
              : m.key === "orders"
                ? data?.totals.rangeOrders
                : data?.totals.rangeVisits;
          return (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-xl border p-3 text-right transition-colors ${
                metric === m.key
                  ? "border-gold/50 bg-gold/10"
                  : "border-gold/15 glass-soft hover:border-gold/30"
              }`}
            >
              <Icon size={15} style={{ color: m.from }} />
              <p className="mt-1.5 truncate text-[13px] font-black text-cream">
                {total === undefined ? "…" : m.format(total)}
              </p>
              <p className="text-[10.5px] text-sage">{m.label}</p>
            </button>
          );
        })}
      </div>

      {/* ---------- the bar chart ---------- */}
      {error ? (
        <p className="py-10 text-center text-sm text-red-400">{error}</p>
      ) : loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال محاسبه…
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto pb-2">
          {series.every((b) => !Number(b[metric])) && (
            <p className="mb-2 text-center text-[11px] text-sage">
              در این بازه داده‌ای برای «{active.label}» ثبت نشده است.
            </p>
          )}
          <div
            // LAYOUT FIX: the columns must STRETCH to the full chart height,
            // otherwise each column is only as tall as its own labels and the
            // percentage-height bars collapse to nothing (Firefox especially).
            className="flex h-64 min-w-full items-stretch justify-between gap-1.5 sm:gap-2.5"
            style={{ minWidth: series.length * 46 }}
          >
            {series.map((bucket, index) => {
              const value = Number(bucket[metric]) || 0;
              const pct = (value / max) * 100;
              return (
                <div
                  key={bucket.key}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  {/* value label, appears on hover/focus */}
                  <span className="text-[9.5px] font-bold whitespace-nowrap text-gold opacity-0 transition-opacity group-hover:opacity-100">
                    {active.format(value)}
                  </span>

                  {/* The track owns the height; the bar is absolutely
                      positioned inside it so its percentage height always
                      resolves against a definite box. */}
                  <div className="relative min-h-0 w-full flex-1">
                    <motion.div
                      // A fresh key per metric/range restarts the grow animation,
                      // which is what makes switching tabs feel alive.
                      key={`${metric}-${range}-${bucket.key}`}
                      initial={{ height: "0%", opacity: 0.35 }}
                      animate={{ height: `${Math.max(pct, value > 0 ? 4 : 1.5)}%`, opacity: 1 }}
                      transition={{
                        duration: 0.7,
                        delay: index * 0.045,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      whileHover={{ scaleY: 1.05 }}
                      style={{
                        originY: 1,
                        background: `linear-gradient(to top, ${active.to}, ${active.from})`,
                        boxShadow: `0 0 18px -6px ${active.from}`,
                      }}
                      className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[34px] rounded-t-lg"
                    />
                  </div>

                  <span className="text-[9.5px] whitespace-nowrap text-sage">
                    {axisLabel(bucket.key, range)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- order counts per status ---------- */}
      {statusCounts && <StatusBars counts={statusCounts} />}
    </section>
  );
}

const STATUS_TINT: Record<string, string> = {
  "در انتطار تأیید": "#e8cd85",
  "در انتزار تأیید": "#e8cd85",
  "در حال آماده‌سازی": "#8fd3ff",
  "ارسال شد": "#b39ddb",
  "تحویل داده شد": "#7fd6a8",
  "لغو شد": "#ef8a8a",
};

function StatusBars({ counts }: { counts: StatusCounts }) {
  const rows = counts.byStatus ?? [];
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="mt-7 border-t border-gold/10 pt-5">
      <div className="flex items-center gap-2 text-gold">
        <PieChart size={15} />
        <h3 className="text-sm font-black">تعداد سفارش‌ها بر اساس وضعیت</h3>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-sage">هنوز سفارشی ثبت نشده است.</p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {rows.map((row, index) => {
            const tint = STATUS_TINT[row.status] || "#d4af37";
            return (
              <div key={row.status} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-[11px] font-bold text-sage sm:w-36">
                  {row.status}
                </span>
                <div className="h-6 flex-1 overflow-hidden rounded-lg bg-night/60">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(row.count / max) * 100}%` }}
                    transition={{ duration: 0.75, delay: index * 0.07, ease: "easeOut" }}
                    className="flex h-full items-center justify-end rounded-lg pl-2"
                    style={{ background: `linear-gradient(to left, ${tint}, ${tint}55)` }}
                  >
                    <span className="text-[10.5px] font-black text-[#0b2417]">
                      {toFa(row.count)}
                    </span>
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
