"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Trash2 } from "lucide-react";
import { formatToman } from "@/lib/data";

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

export default function UsersAdmin() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
            {customers.map((customer) => (
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
