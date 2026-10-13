"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Download, Loader2, Receipt, Search, Trash2, UserPlus } from "lucide-react";
import { formatToman } from "@/lib/data";
import { InvoiceLines } from "@/components/InvoiceLines";
import { ItemCampaignTags } from "@/components/InvoiceItemTags";

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
  points?: number;
  vip?: boolean;
  star?: number;
  referralCount?: number;
  referredBy?: ReferralContact | null;
};

type ReferralContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt?: string | Date;
  deleted?: boolean;
};

type ReferralDetails = {
  referrer: ReferralContact | null;
  referralCount: number;
  referrals: ReferralContact[];
  truncated?: boolean;
};

type ReferralPanelState = ReferralDetails | "loading" | { error: string };

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
  "w-full rounded-xl glass-input px-4 py-2.5 text-sm text-cream placeholder:text-sage/75 focus:border-gold focus:outline-none";

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
            <span className="text-[10px] text-sage/90">{fmtDate(order.createdAt)}</span>
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
            <span className="min-w-0 text-cream">
              <span className="truncate">
                {it.name}
                <span className="text-sage"> × {faNum(it.qty)}</span>
              </span>
              <ItemCampaignTags item={it} tone="light" />
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
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // v42: تفکیک ستاره/VIP + ویرایش وفاداری مشتری (فقط ادمین).
  // تعداد سطح‌های ستاره از پیکربندیِ تنظیمات می‌آید (نه عددِ سخت ۵).
  const [starsCount, setStarsCount] = useState(5);
  const [starFilter, setStarFilter] = useState<number | "all">("all");
  const [vipOnly, setVipOnly] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState("0");
  const [editVip, setEditVip] = useState(false);
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  // v39: فاکتورهای خرید مشتری — باز/بسته در همان ردیف
  const [openId, setOpenId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Record<string, InvoiceOrder[] | "loading" | string>>({});
  const [openReferralId, setOpenReferralId] = useState<string | null>(null);
  const [referralDetails, setReferralDetails] = useState<Record<string, ReferralPanelState>>({});

  const loadCustomers = useCallback(async (query = "") => {
    setError("");
    try {
      const p = new URLSearchParams();
      p.set("search", query);
      if (starFilter !== "all") p.set("star", String(starFilter));
      if (vipOnly) p.set("vip", "1");
      const res = await fetch(`/api/admin/users?${p.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCustomers(data.users ?? []);
      if (typeof data.starsCount === "number" && data.starsCount > 0) setStarsCount(data.starsCount);
    } catch {
      setError("خطا در دریافت فهرست مشتریان.");
      setCustomers([]);
    }
  }, [starFilter, vipOnly]);

  const exportCustomers = async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (starFilter !== "all") params.set("star", String(starFilter));
      if (vipOnly) params.set("vip", "1");
      const query = params.toString();
      const res = await fetch(`/api/admin/users/export.xlsx${query ? `?${query}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "دریافت فایل اکسل انجام نشد.");
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/i.exec(disposition)?.[1] ?? "bella-customers.xlsx";
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError("ارتباط با سرور برای دریافت فایل اکسل برقرار نشد.");
    } finally {
      setExporting(false);
    }
  };

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

  const toggleReferrals = async (customer: Customer) => {
    if (openReferralId === customer.id) {
      setOpenReferralId(null);
      return;
    }
    setOpenReferralId(customer.id);
    const cached = referralDetails[customer.id];
    if (cached && cached !== "loading" && !("error" in cached)) return;

    setReferralDetails((prev) => ({ ...prev, [customer.id]: "loading" }));
    try {
      const res = await fetch(`/api/admin/users/${customer.id}/referrals`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setReferralDetails((prev) => ({
          ...prev,
          [customer.id]: { error: data?.error ?? "خطا در دریافت اطلاعات زیرمجموعه." },
        }));
        return;
      }
      setReferralDetails((prev) => ({
        ...prev,
        [customer.id]: {
          referrer: data?.referrer ?? null,
          referralCount: Number(data?.referralCount) || 0,
          referrals: Array.isArray(data?.referrals) ? data.referrals : [],
          truncated: data?.truncated === true,
        },
      }));
    } catch {
      setReferralDetails((prev) => ({
        ...prev,
        [customer.id]: { error: "ارتباط با سرور برقرار نشد." },
      }));
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

  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setEditPoints(String(c.points ?? 0));
    setEditVip(c.vip === true);
  };

  const saveLoyalty = async () => {
    if (!editId) return;
    setSavingLoyalty(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: Number(editPoints) || 0, vip: editVip }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "ذخیره نشد.");
        return;
      }
      setEditId(null);
      await loadCustomers(search);
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setSavingLoyalty(false);
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sage/90"
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
          <button
            type="button"
            onClick={() => void exportCustomers()}
            disabled={exporting}
            aria-busy={exporting}
            title="خروجی همهٔ مشتریان منطبق با جست‌وجو و فیلترهای فعلی"
            className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-xs font-bold text-[#241a22] transition hover:bg-gold-soft disabled:cursor-wait disabled:opacity-60"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? "در حال آماده‌سازی…" : "دریافت فایل Excel"}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-sage/80">
          فایل شامل همهٔ مشتریان فعالِ منطبق با جست‌وجو و فیلترهای ستاره و VIP است؛ محدود به ۵۰۰ ردیف نمایشی نیست.
        </p>

        {/* تفکیک ستاره + بخش VIP */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-sage">ستاره:</span>
          {(["all", ...Array.from({ length: starsCount }, (_, i) => i + 1)] as Array<number | "all">).map((lv) => (
            <button
              key={String(lv)}
              type="button"
              onClick={() => setStarFilter(lv)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                starFilter === lv
                  ? "border border-gold/60 bg-gold/15 text-gold-soft"
                  : "border border-gold/20 text-sage hover:bg-gold/10"
              }`}
            >
              {lv === "all" ? "همه" : `★ ${lv}`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setVipOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
              vipOnly ? "border border-gold/60 bg-gold/15 text-gold-soft" : "border border-gold/20 text-sage hover:bg-gold/10"
            }`}
          >
            فقط VIP
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
              const referralOpen = openReferralId === customer.id;
              const referralData = referralDetails[customer.id];
              return (
                <div key={customer.id} className="gold-ring rounded-2xl glass-panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 truncate text-sm font-bold text-cream">
                        {customer.name}
                        {customer.vip && (
                          <span className="rounded-full border border-gold/60 bg-gold/15 px-2 py-0.5 text-[9.5px] font-black text-gold-soft">
                            VIP
                          </span>
                        )}
                        <span className="rounded-full border border-gold/20 px-2 py-0.5 text-[9.5px] font-bold text-gold-soft">
                          {"★".repeat(Math.min(starsCount, customer.star ?? 0)) || "—"} ·{" "}
                          {(customer.points ?? 0).toLocaleString("fa-IR")} امتیاز
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gold-soft">
                        {customer.email || "بدون ایمیل"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-sage">
                        {customer.phone || "بدون شماره"} · عضویت: {fmtDate(customer.createdAt)}
                      </p>
                      {customer.address && (
                        <p className="mt-1 text-[11px] leading-5 text-sage">{customer.address}</p>
                      )}
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-sage">
                        <UserPlus size={12} className="shrink-0 text-gold-soft" />
                        <span className="font-bold text-gold-soft">معرف مستقیم:</span>
                        {customer.referredBy ? (
                          <>
                            <span className="text-cream">
                              {customer.referredBy.deleted
                                ? `حساب حذف‌شده · ${customer.referredBy.name}`
                                : customer.referredBy.name}
                            </span>
                            {!customer.referredBy.deleted && customer.referredBy.phone && (
                              <bdi dir="ltr" className="text-sage">{customer.referredBy.phone}</bdi>
                            )}
                            {!customer.referredBy.deleted && customer.referredBy.email && (
                              <bdi dir="ltr" className="text-sage">{customer.referredBy.email}</bdi>
                            )}
                          </>
                        ) : (
                          <span>ثبت نشده</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="rounded-full border border-gold/20 px-2.5 py-1 text-[10px] text-sage">
                        {customer.orderCount.toLocaleString("fa-IR")} سفارش ·{" "}
                        {formatToman(customer.totalSpent)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggleReferrals(customer)}
                        aria-expanded={referralOpen}
                        className="flex items-center gap-1 rounded-full border border-gold/30 px-3 py-1.5 text-[11px] font-bold text-gold-soft transition hover:bg-gold/10"
                      >
                        <UserPlus size={13} />
                        زیرمجموعه‌ها ({faNum(customer.referralCount ?? 0)})
                        <ChevronDown
                          size={13}
                          className={`transition-transform ${referralOpen ? "rotate-180" : ""}`}
                        />
                      </button>
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
                        onClick={() => openEdit(customer)}
                        className="rounded-lg border border-gold/30 px-3 py-1.5 text-[11px] font-bold text-gold-soft transition hover:bg-gold/10"
                      >
                        وفاداری
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

                  {referralOpen && (
                    <div className="mt-3 border-t border-gold/15 pt-3">
                      {!referralData || referralData === "loading" ? (
                        <p className="flex items-center gap-2 text-[11px] text-sage">
                          <Loader2 size={13} className="animate-spin" /> در حال دریافت اطلاعات معرف و زیرمجموعه‌ها…
                        </p>
                      ) : "error" in referralData ? (
                        <p className="text-[11px] text-red-300">{referralData.error}</p>
                      ) : (
                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gold/15 glass-soft p-3">
                            <div>
                              <p className="text-[10px] font-bold text-sage">معرف مستقیم</p>
                              {referralData.referrer ? (
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                                  <span className="font-bold text-cream">
                                    {referralData.referrer.deleted
                                      ? `حساب حذف‌شده · ${referralData.referrer.name}`
                                      : referralData.referrer.name}
                                  </span>
                                  {!referralData.referrer.deleted && referralData.referrer.phone && (
                                    <bdi dir="ltr" className="text-sage">{referralData.referrer.phone}</bdi>
                                  )}
                                  {!referralData.referrer.deleted && referralData.referrer.email && (
                                    <bdi dir="ltr" className="text-sage">{referralData.referrer.email}</bdi>
                                  )}
                                </div>
                              ) : (
                                <p className="mt-1 text-[11px] text-sage">برای این مشتری معرف ثبت نشده است.</p>
                              )}
                            </div>
                            <div className="text-[11px] text-sage">
                              زیرمجموعه‌های مستقیم: <b className="text-gold-soft">{faNum(referralData.referralCount)} نفر</b>
                            </div>
                          </div>

                          {referralData.referrals.length === 0 ? (
                            <p className="mt-3 text-[11px] text-sage">این مشتری زیرمجموعهٔ مستقیمی ندارد.</p>
                          ) : (
                            <div className="mt-3 flex flex-col gap-2">
                              {referralData.referrals.map((person) => (
                                <div key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/10 px-3 py-2 text-[11px]">
                                  <div className="min-w-0">
                                    <p className="truncate font-bold text-cream">{person.name}</p>
                                    <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sage">
                                      {person.phone && <bdi dir="ltr">{person.phone}</bdi>}
                                      {person.email && <bdi dir="ltr">{person.email}</bdi>}
                                    </p>
                                  </div>
                                  {person.createdAt && (
                                    <span className="shrink-0 text-sage">عضویت: {fmtDate(person.createdAt)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {referralData.truncated && (
                            <p className="mt-2 text-[10px] text-sage">فهرست به ۵۰۰ نفر محدود شده است.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

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

                  {editId === customer.id && (
                    <div className="mt-3 border-t border-gold/15 pt-3">
                      <p className="text-[11px] font-black text-gold-soft">ویرایش وفاداری (فقط ادمین)</p>
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <label className="block">
                          <span className="mb-1 block text-[10.5px] font-bold text-sage">امتیاز (ستاره)</span>
                          <input
                            type="number"
                            min={0}
                            value={editPoints}
                            onChange={(e) => setEditPoints(e.target.value)}
                            className={`${inputCls} w-32`}
                            dir="ltr"
                          />
                        </label>
                        <label className="flex items-center gap-2 pb-2 text-xs font-bold text-sage">
                          <input
                            type="checkbox"
                            checked={editVip}
                            onChange={(e) => setEditVip(e.target.checked)}
                            className="h-4 w-4 accent-[#d4af7c]"
                          />
                          مشتری VIP باشد
                        </label>
                        <button
                          type="button"
                          onClick={() => void saveLoyalty()}
                          disabled={savingLoyalty}
                          className="rounded-full border border-gold/40 px-4 py-1.5 text-[11px] font-bold text-gold-soft hover:bg-gold/10 disabled:opacity-50"
                        >
                          {savingLoyalty ? "در حال ذخیره…" : "ذخیره"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="rounded-full border border-gold/20 px-4 py-1.5 text-[11px] font-bold text-sage hover:bg-gold/10"
                        >
                          انصراف
                        </button>
                      </div>
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
