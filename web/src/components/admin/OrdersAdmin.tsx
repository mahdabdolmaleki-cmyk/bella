"use client";
import { useState } from "react";
import { ChevronDown, Package, MessageCircle, Phone, MapPin, Mail, Truck, Save, BellRing, BarChart3 } from "lucide-react";
import { formatToman, toFa } from "@/lib/data";
import { InvoiceLines } from "@/components/InvoiceLines";
import type { Order } from "@/lib/types";

type Message = {
  id: number;
  name: string;
  phone: string;
  body: string;
  createdAt: string | Date;
};

const STATUSES = [
  "در انتظار تأیید",
  "در حال آماده‌سازی",
  "ارسال شد",
  "تحویل داده شد",
  "لغو شد",
];

const STATUS_COLOR: Record<string, string> = {
  "در انتظار تأیید": "text-amber-300 border-amber-300/30 bg-amber-300/10",
  "در حال آماده‌سازی": "text-sky-300 border-sky-300/30 bg-sky-300/10",
  "ارسال شد": "text-violet-300 border-violet-300/30 bg-violet-300/10",
  "تحویل داده شد": "text-emerald-300 border-emerald-300/30 bg-emerald-300/10",
  "لغو شد": "text-red-400 border-red-400/30 bg-red-400/10",
};

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("fa-IR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
}

export default function OrdersAdmin({
  initialOrders,
  initialMessages,
}: {
  initialOrders: Order[];
  initialMessages: Message[];
}) {
  const [tab, setTab] = useState<"orders" | "messages">("orders");
  const [orders, setOrders] = useState(initialOrders);
  const [openId, setOpenId] = useState<number | null>(null);
  // Draft tracking codes, keyed by order id, so typing in one row never
  // touches another and nothing is saved until the admin presses ذخیره.
  const [tracking, setTracking] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const [error, setError] = useState("");
  // v35: پاک‌کردن پرچم «درخواست لغوی مشتری» بدون تغییر وضعیت سفارش.
  const [clearingId, setClearingId] = useState<number | null>(null);
  // v36: حذف از گزارش فروش
  const [salesToggling, setSalesToggling] = useState<number | null>(null);

  const clearCancelRequest = async (id: number) => {
    const previous = orders.find((o) => o.id === id);
    setClearingId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clearCancelRequest: true }),
      });
      if (!res.ok) throw new Error();
      setOrders((list) =>
        list.map((o) => (o.id === id ? { ...o, cancelRequested: false } : o))
      );
    } catch {
      setError("بررسی درخواست لغو ثبت نشد.");
      if (previous) {
        setOrders((list) =>
          list.map((o) => (o.id === id ? { ...o, cancelRequested: previous.cancelRequested } : o))
        );
      }
    }
    setClearingId(null);
  };

  const toggleExcludeFromSales = async (id: number) => {
    const target = orders.find((o) => o.id === id);
    if (!target) return;
    const nextVal = !target.excludeFromSales;
    setSalesToggling(id);
    setError("");
    const prev = target.excludeFromSales;
    setOrders((list) => list.map((o) => (o.id === id ? { ...o, excludeFromSales: nextVal } : o)));
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ excludeFromSales: nextVal }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => null);
      if (data?.order) {
        setOrders((list) => list.map((o) => (o.id === id ? { ...o, ...data.order } : o)));
      }
    } catch {
      setError("تغییر وضعیت گزارش فروش انجام نشد.");
      setOrders((list) => list.map((o) => (o.id === id ? { ...o, excludeFromSales: prev } : o)));
    }
    setSalesToggling(null);
  };

  const updateStatus = async (id: number, status: string) => {
    const previous = orders.find((o) => o.id === id)?.status;
    setOrders((list) => list.map((o) => (o.id === id ? { ...o, status } : o)));
    setError("");
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      // Cancelling releases stock server-side, so pull the fresh row back in.
      const data = await res.json().catch(() => null);
      if (data?.order) {
        setOrders((list) => list.map((o) => (o.id === id ? { ...o, ...data.order } : o)));
      }
    } catch {
      // BUG FIX: reverting to `initialOrders` discarded every OTHER row the
      // admin had already changed in this session.
      if (previous) {
        setOrders((list) => list.map((o) => (o.id === id ? { ...o, status: previous } : o)));
      }
      setError("تغییر وضعیت انجام نشد. دوباره تلاش کنید.");
    }
  };

  // Saves ONLY the courier barcode. The server leaves the workflow status
  // untouched when no `status` field is sent.
  const saveTracking = async (id: number) => {
    const trackingCode = (tracking[id] ?? "").trim();
    setSavingId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ trackingCode }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => null);
      if (data?.order) {
        setOrders((list) => list.map((o) => (o.id === id ? { ...o, ...data.order } : o)));
        setTracking((t) => {
          const next = { ...t };
          delete next[id];
          return next;
        });
      }
    } catch {
      setError("ثبت کد رهگیری انجام نشد.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-black text-cream">سفارش‌ها و پیام‌ها</h1>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTab("orders")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${
            tab === "orders" ? "bg-gold text-[#241a05]" : "border border-gold/25 text-sage"
          }`}
        >
          <Package size={14} /> سفارش‌ها ({orders.length.toLocaleString("fa-IR")})
        </button>
        <button
          onClick={() => setTab("messages")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${
            tab === "messages" ? "bg-gold text-[#241a05]" : "border border-gold/25 text-sage"
          }`}
        >
          <MessageCircle size={14} /> پیام‌های تماس ({initialMessages.length.toLocaleString("fa-IR")})
        </button>
      </div>

      {tab === "orders" && (
        <div className="mt-5 flex flex-col gap-3">
          {orders.length === 0 && <p className="text-sm text-sage">هنوز سفارشی ثبت نشده است.</p>}
          {orders.map((o) => {
            const items = Array.isArray(o.items)
              ? (o.items as { id: number; name: string; qty: number; price: number }[])
              : [];
            const open = openId === o.id;
            return (
              <div key={o.id} className="gold-ring overflow-hidden rounded-2xl glass-panel">
                <button
                  onClick={() => setOpenId(open ? null : o.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-right"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gold-soft">{o.code}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[o.status] || "text-sage border-gold/20"}`}
                      >
                        {o.status}
                      </span>
                      {o.cancelRequested && (
                        <span className="animate-pulse rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-black text-amber-300">
                          درخواست لغو مشتری
                        </span>
                      )}
                      {o.vipBox && (
                        <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-soft">
                          باکس VIP
                        </span>
                      )}
                      {!!o.discountAmount && (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          {o.couponCode
                            ? o.couponFixed
                              ? `کد تخفیف ${o.couponCode} (${toFa(o.couponFixed)} تومان)`
                              : `کد تخفیف ${o.couponCode} (${toFa(o.discountPercent ?? 0)}٪)`
                            : `تخفیف خرید اول (${toFa(o.discountPercent ?? 0)}٪)`}
                        </span>
                      )}
                      {o.shippingCod && (
                        <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                          پس‌کرایه
                        </span>
                      )}
                      {o.excludeFromSales && (
                        <span className="rounded-full border border-zinc-400/40 bg-zinc-400/10 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
                          حذف از فروش
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-bold text-cream">
                      {o.customerName} — {formatToman(o.total)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-sage">{fmtDate(o.createdAt)}</p>
                  </div>
                  <ChevronDown size={16} className={`shrink-0 text-sage transition-transform ${open ? "rotate-180" : ""}`} />
                </button>

                {open && (
                  <div className="border-t border-gold/10 px-4 py-4">
                    {o.cancelRequested && (
                      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-3">
                        <BellRing size={15} className="shrink-0 text-amber-300" />
                        <p className="min-w-0 flex-1 text-[11.5px] font-bold leading-5 text-amber-200">
                          مشتری درخواست لغو این سفارش را داده
                          {o.cancelRequestedAt &&
                            ` — ${fmtDate(o.cancelRequestedAt)}`}
                          . (این درخواست در تب «پیام‌ها» هم ثبت شده است.)
                        </p>
                        <button
                          onClick={() => clearCancelRequest(o.id)}
                          disabled={clearingId === o.id}
                          className="shrink-0 rounded-full border border-amber-300/50 px-3.5 py-1.5 text-[11px] font-bold text-amber-200 transition hover:bg-amber-300/10 disabled:opacity-50"
                        >
                          {clearingId === o.id ? "…" : "بررسی شد"}
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-sage">
                      <span className="flex items-center gap-1.5">
                        <Phone size={13} className="text-gold/70" /> {o.phone}
                      </span>
                      {o.email && (
                        <span className="flex items-center gap-1.5">
                          <Mail size={13} className="text-gold/70" />
                          <span dir="ltr">{o.email}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-gold/70" />
                        {[o.province, o.city].filter(Boolean).join("، ")}
                        {o.province || o.city ? " — " : ""}
                        {o.address}
                      </span>
                      {o.postalCode && (
                        <span className="flex items-center gap-1.5">
                          <Package size={13} className="text-gold/70" />
                          کد پستی: <span className="font-mono">{o.postalCode}</span>
                        </span>
                      )}
                      {o.shippingLabel && (
                        <span className="flex items-center gap-1.5">
                          <Truck size={13} className="text-gold/70" />
                          {o.shippingLabel}
                          {o.freeShipping ? " (رایگان)" : ` — ${formatToman(o.shippingCost ?? 0)}`}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between text-xs text-cream/90">
                          <span>
                            {it.name} × {it.qty.toLocaleString("fa-IR")}
                          </span>
                          <span className="text-sage">{formatToman(it.price * it.qty)}</span>
                        </div>
                      ))}
                    </div>

                    {/* فاکتور کامل — نسخهٔ مشترک v41: تخفیف کد/خرید اول، باکس ویژه، و برای پس‌کرایه بجای «مبلغ کل» ردیف «پس کرایه» */}
                    <div className="mt-3 border-t border-gold/10 pt-3">
                      <InvoiceLines order={o as any} tone="dark" />
                    </div>

                    {/* Courier barcode given to the customer for tracking. */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <label className="text-[11px] font-bold text-sage">کد رهگیری مرسوله:</label>
                      <input
                        dir="ltr"
                        value={tracking[o.id] ?? o.trackingCode ?? ""}
                        onChange={(e) => setTracking((t) => ({ ...t, [o.id]: e.target.value }))}
                        placeholder="مثلاً 1234567890"
                        className="w-48 rounded-lg glass-input px-3 py-1.5 text-xs text-cream placeholder:text-sage/40 focus:border-gold focus:outline-none"
                      />
                      <button
                        onClick={() => saveTracking(o.id)}
                        disabled={savingId === o.id || tracking[o.id] === undefined}
                        className="flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-[#241a05] disabled:opacity-40"
                      >
                        <Save size={13} />
                        {savingId === o.id ? "در حال ذخیره…" : "ذخیره"}
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-sage">تغییر وضعیت:</label>
                        <select
                          value={o.status}
                          onChange={(e) => updateStatus(o.id, e.target.value)}
                          className="rounded-lg glass-input px-3 py-1.5 text-xs text-cream focus:border-gold focus:outline-none"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => toggleExcludeFromSales(o.id)}
                        disabled={salesToggling === o.id}
                        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition ${o.excludeFromSales ? "border-zinc-400/40 bg-zinc-400/15 text-zinc-300" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"}`}
                      >
                        <BarChart3 size={13} />
                        {salesToggling === o.id ? "…" : o.excludeFromSales ? "بازگردانی به گزارش فروش" : "حذف از گزارش فروش"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "messages" && (
        <div className="mt-5 flex flex-col gap-3">
          {initialMessages.length === 0 && <p className="text-sm text-sage">پیامی دریافت نشده است.</p>}
          {initialMessages.map((m) => (
            <div key={m.id} className="gold-ring rounded-2xl glass-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-cream">{m.name}</p>
                <p className="text-[11px] text-sage">{fmtDate(m.createdAt)}</p>
              </div>
              <p className="mt-1 text-xs text-gold-soft">{m.phone}</p>
              <p className="mt-2 text-xs leading-6 text-cream/90">{m.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
