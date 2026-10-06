"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Receipt, Search, Trash2 } from "lucide-react";
import { formatToman } from "@/lib/data";
import { InvoiceLines } from "@/components/InvoiceLines";

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  createdAt: string | Date;
  phoneVerified?: boolean;
  orderCount: number;
  totalSpent: number;
};

// همان Order DTO که مشتری در حساب خودش می‌بیند (برای تفکیک دقیق فاکتور).
type InvoiceOrder = {
  code: string;
  createdAt?: string | Date;
  status: string;
  paymentStatus?: string;
  items: { id: number; name: string; qty: number; price: number }[];
  subtotal?: number;
  total: number;
  discountPercent?: number;
  discountAmount?: number;
  couponCode?: string;
  vipBoxFee?: number;
  shippingCost?: number;
  shippingLabel?: string;
  shippingCod?: boolean;
  freeShipping?: boolean;
  onlinePaid?: number;
  trackingCode?: string;
  refId?: string | null;
  paymentFailReason?: string;
};

const faNum = (n: number) => n.toLocaleString("fa-IR");

const inputCls =
  "w-full rounded-xl glass-input px-4 py-2.5 text-sm text-cream placeholder:text-sage/50 focus:border-gold focus:outline-none";

function fmtDate(date: string | Date) {
  return new Date(date).toLocaleDateString("fa-IR", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── ردیف‌های فاکتور — کامپوننت مشترک v41 (همان صفحهٔ سفارش‌های مشتری) ──

function InvoiceCard({ order }: { order: InvoiceOrder }) {
  return (
    <div className="rounded-xl border border-gold/15 glass-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-[#e8dde3] px-2 py-0.5 font-mono text-[11px] text-[#241a22]">
            {order.code}
          </span>
          {order.createdAt && (
            <span className="text-[10px] text-sage/70">{fmtDate(order.createdAt)}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-gold/20 px-2 py-0.5 text-[10px] text-gold-soft">
            {order.status}
          </span>
        </div>
      </div>

      <div className="mt-2.5 space-y-1">
        {order.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="min-w-0 truncate text-cream">
              {it.name}
              <span className="text-sage">
                {" "}
                × {faNum(it.qty)}
              </span>
            </span>
            <span className="shrink-0 text-gold-soft">{formatToman(it.price * it.qty)}</span>
          </div>
        ))}
      </div>

      <div className="mt-2.5">
        <InvoiceLines order={order} tone="light" />
      </div>

      {(order.refId || order.trackingCode) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-sage">
          {order.refId && (
            <span>
              کد رهگیری پرداخت: <span className="font-mono text-gold-soft">{order.refId}</span>
            </span>
          )}
          {order.trackingCode && (
            <span>
              کد رهگیری مرسوله: <span className="font-mono text-gold-soft">{order.trackingCode}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function UsersAdmin() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // v39: فاکتورهای خرید مشتری — باز/بسته در همان ردیف
  const [openId, setOpenId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Record<string, InvoiceOrder[] | "loading" | string>>({});

  const loadCustomers = useCallback(async (query = "") => {
    setError("");
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCustomers(data.users ?? []);
    } catch {
      setError("خطا در دریافت فهرست مشتریان.");
      setCustomers([]);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const toggleInvoices = async (customer: Customer) => {
    if (openId === customer.id) {
      setOpenId(null);
      return;
    }
    setOpenId(customer.id);
    if (invoices[customer.id] && invoices[customer.id] !== "loading") return;
    setInvoices((prev) => ({ ...prev, [customer.id]: "loading" }));
    try {
      const res = await fetch(`/api/admin/users/${customer.id}/orders`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setInvoices((prev) => ({ ...prev, [customer.id]: data?.error ?? "خطا در دریافت فاکتورها." }));
        return;
      }
      setInvoices((prev) => ({ ...prev, [customer.id]: data?.orders ?? [] }));
    } catch {
      setInvoices((prev) => ({ ...prev, [customer.id]: "ارتباط با سرور برقرار نشد." }));
    }
  };

  const deleteCustomer = async (customer: Customer) => {
    if (!confirm(`حساب «${customer.name}» حذف شود؟ سفارش‌های ثبت‌شده باقی می‌مانند.`)) {
      return;
    }

    setDeletingId(customer.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${customer.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "حذف مشتری انجام نشد.");
        return;
      }
      await loadCustomers(search);
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-black text-cream">مدیریت مشتریان</h1>
      <p className="mt-1 text-xs text-sage">
        اطلاعات مشتریان فقط از طریق ثبت‌نام و پروفایل تأییدشدهٔ خودشان ساخته یا ویرایش می‌شود.
      </p>

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sage/60"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void loadCustomers(search)}
              placeholder="جست‌وجو بر اساس نام، ایمیل یا شماره"
              className={`${inputCls} pr-9`}
            />
          </div>
          <button
            type="button"
            onClick={() => void loadCustomers(search)}
            className="rounded-full border border-gold/30 px-4 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
          >
            جست‌وجو
          </button>
        </div>

        {!customers ? (
          <div className="mt-6 flex items-center gap-2 text-sage">
            <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
          </div>
        ) : customers.length === 0 ? (
          <p className="mt-6 text-sm text-sage">هیچ مشتری‌ای یافت نشد.</p>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {customers.map((customer) => {
              const data = invoices[customer.id];
              const open = openId === customer.id;
              return (
                <div key={customer.id} className="gold-ring rounded-2xl glass-panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-cream">{customer.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gold-soft">
                        {customer.email || "بدون ایمیل"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-sage">
                        {customer.phone || "بدون شماره"} · عضویت: {fmtDate(customer.createdAt)}
                      </p>
                      {customer.address && (
                        <p className="mt-1 text-[11px] leading-5 text-sage">{customer.address}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-gold/20 px-2.5 py-1 text-[10px] text-sage">
                        {customer.orderCount.toLocaleString("fa-IR")} سفارش ·{" "}
                        {formatToman(customer.totalSpent)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggleInvoices(customer)}
                        disabled={customer.orderCount === 0}
                        className="flex items-center gap-1 rounded-full border border-gold/30 px-3 py-1.5 text-[11px] font-bold text-gold-soft transition hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Receipt size={13} />
                        فاکتورها
                        <ChevronDown
                          size={13}
                          className={`transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCustomer(customer)}
                        disabled={deletingId === customer.id}
                        className="rounded-lg border border-red-400/25 p-2 text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                        aria-label={`حذف ${customer.name}`}
                      >
                        {deletingId === customer.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 border-t border-gold/15 pt-3">
                      {!data || data === "loading" ? (
                        <p className="flex items-center gap-2 text-[11px] text-sage">
                          <Loader2 size={13} className="animate-spin" /> در حال دریافت فاکتورها…
                        </p>
                      ) : typeof data === "string" ? (
                        <p className="text-[11px] text-red-300">{data}</p>
                      ) : data.length === 0 ? (
                        <p className="text-[11px] text-sage">فاکتوری برای این مشتری ثبت نشده است.</p>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          {data.map((o) => (
                            <InvoiceCard key={o.code} order={o} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
