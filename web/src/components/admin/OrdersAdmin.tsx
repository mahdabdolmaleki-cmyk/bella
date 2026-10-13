"use client";
import { useState } from "react";
import { ChevronDown, Package, MessageCircle, Phone, MapPin, Mail, Truck, Save, BellRing, BarChart3 } from "lucide-react";
import { formatToman, toFa } from "@/lib/data";
import { InvoiceLines } from "@/components/InvoiceLines";
import { ItemCampaignTags } from "@/components/InvoiceItemTags";
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
  // سفارش‌ها روی کارت کرم‌اند؛ هر وضعیت رنگ متنِ تیره و مرز مستقل دارد.
  "در انتظار تأیید": "text-[#65470c] border-[#a27b34] bg-[#f3e7d3]",
  "در حال آماده‌سازی": "text-[#214c65] border-[#376f8b] bg-[#e5f0f4]",
  "ارسال شد": "text-[#4d2d68] border-[#755291] bg-[#eee7f3]",
  "تحویل داده شد": "text-[#16563a] border-[#3c805e] bg-[#e3f0e8]",
  "لغو شد": "text-[#8c2f3f] border-[#a84b5b] bg-[#f5e5e7]",
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
  // تفکیک سفارش‌ها بر اساس وضعیت (همه / هر وضعیت).
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const statusList = [...new Set(orders.map((o) => o.status))];
  const visibleOrders = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                statusFilter === "all" ? "bg-gold text-[#241a05]" : "border border-gold/25 text-gold-soft hover:bg-gold/10"
              }`}
            >
              همه ({orders.length.toLocaleString("fa-IR")})
            </button>
            {statusList.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                  statusFilter === s ? "bg-gold text-[#241a05]" : "border border-gold/25 text-gold-soft hover:bg-gold/10"
                }`}
              >
                {s} ({orders.filter((o) => o.status === s).length.toLocaleString("fa-IR")})
              </button>
            ))}
          </div>
          {orders.length === 0 && <p className="text-sm text-sage">هنوز سفارشی ثبت نشده است.</p>}
          {orders.length > 0 && visibleOrders.length === 0 && (
            <p className="text-sm text-sage">سفارشی با این وضعیت نیست.</p>
          )}
          {visibleOrders.map((o) => {
            const fixedDiscount = Number(o.discountFixed ?? (o.couponCode ? o.couponFixed ?? 0 : 0));
            const discountDetail =
              fixedDiscount > 0 && !(o.discountPercent ?? 0)
                ? `${toFa(fixedDiscount)} تومان`
                : `${toFa(o.discountPercent ?? 0)}٪`;
            const discountBadge = o.couponCode
              ? `کد تخفیف ${o.couponCode} (${discountDetail})`
              : o.discountSource === "star"
                ? `تخفیف وفاداری (${discountDetail})`
                : `تخفیف خرید اول (${discountDetail})`;
            const items = Array.isArray(o.items)
              ? (o.items as {
                  id: number;
                  name: string;
                  qty: number;
                  price: number;
                  oldPrice?: number | null;
                  festival?: boolean;
                  discount?: boolean;
                }[])
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
                      <span className="font-mono text-sm font-semibold text-gold-soft">{o.code}</span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-extrabold ${STATUS_COLOR[o.status] || "text-[#4f3d48] border-[#8b7380]"}`}
                      >
                        {o.status}
                      </span>
                      {o.cancelRequested && (
                        <span className="animate-pulse rounded-full border border-[#9a6b24] bg-[#f3e7d3] px-2.5 py-1 text-xs font-black text-[#65470c]">
                          درخواست لغو مشتری
                        </span>
                      )}
                      {o.vipBox && (
                        <span className="rounded-full border border-[#9c7440] bg-[#f3e7d3] px-2.5 py-1 text-xs font-bold text-[#65470c]">
                          باکس VIP
                        </span>
                      )}
                      {!!o.discountAmount && (
                        <span className="rounded-full border border-[#2d7654] bg-[#e3f0e8] px-2.5 py-1 text-xs font-bold text-[#16563a]">
                          {discountBadge}
                        </span>
                      )}
                      {o.shippingCod && (
                        <span className="rounded-full border border-[#9a6b24] bg-[#f3e7d3] px-2.5 py-1 text-xs font-bold text-[#65470c]">
                          پس‌کرایه
                        </span>
                      )}
                      {o.excludeFromSales && (
                        <span className="rounded-full border border-[#81747a] bg-[#eee8eb] px-2.5 py-1 text-xs font-bold text-[#42363b]">
                          حذف از فروش
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-base font-extrabold text-cream">
                      {o.customerName} — {formatToman(o.total)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-sage">{fmtDate(o.createdAt)}</p>
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
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-medium text-sage">
                      <span className="flex items-center gap-1.5">
                        <Phone size={13} className="text-gold/90" /> {o.phone}
                      </span>
                      {o.email && (
                        <span className="flex items-center gap-1.5">
                          <Mail size={13} className="text-gold/90" />
                          <span dir="ltr">{o.email}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-gold/90" />
                        {[o.province, o.city].filter(Boolean).join("، ")}
                        {o.province || o.city ? " — " : ""}
                        {o.address}
                      </span>
                      {o.postalCode && (
                        <span className="flex items-center gap-1.5">
                          <Package size={13} className="text-gold/90" />
                          کد پستی: <span className="font-mono">{o.postalCode}</span>
                        </span>
                      )}
                      {o.shippingLabel && (
                        <span className="flex items-center gap-1.5">
                          <Truck size={13} className="text-gold/90" />
                          {o.shippingLabel}
                          {o.freeShipping ? " (رایگان)" : ` — ${formatToman(o.shippingCost ?? 0)}`}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between text-sm text-cream/90">
                          <span>
                            {it.name} × {it.qty.toLocaleString("fa-IR")}
                            <ItemCampaignTags item={it} tone="dark" />
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
                        className="w-48 rounded-lg glass-input px-3 py-2 text-sm text-cream placeholder:text-sage/75 focus:border-gold focus:outline-none"
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
                          className="rounded-lg glass-input px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none"
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
                        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition ${o.excludeFromSales ? "border-[#81747a] bg-[#eee8eb] text-[#42363b]" : "border-[#2d7654] bg-[#e3f0e8] text-[#16563a]"}`}
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
