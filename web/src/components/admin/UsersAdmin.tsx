"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
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

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  password: string;
};

const EMPTY_CUSTOMER: CustomerForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  password: "",
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
  const [busy, setBusy] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm | null>(null);
  const [customerEditId, setCustomerEditId] = useState<string | null>(null);

  const loadCustomers = useCallback(async (query = "") => {
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
    loadCustomers();
  }, [loadCustomers]);

  const send = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "عملیات ناموفق بود.");
        return false;
      }
      return true;
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveCustomer = async () => {
    if (!customerForm) return;

    const payload: Record<string, unknown> = {
      name: customerForm.name,
      email: customerForm.email,
      phone: customerForm.phone,
      address: customerForm.address,
    };
    if (customerForm.password) payload.password = customerForm.password;

    const ok = customerEditId
      ? await send(`/api/admin/users/${customerEditId}`, "PATCH", payload)
      : await send("/api/admin/users", "POST", payload);

    if (ok) {
      setCustomerForm(null);
      setCustomerEditId(null);
      loadCustomers(search);
    }
  };

  const deleteCustomer = async (customer: Customer) => {
    if (!confirm(`حساب «${customer.name}» حذف شود؟ سفارش‌های ثبت‌شده باقی می‌مانند.`)) {
      return;
    }
    if (await send(`/api/admin/users/${customer.id}`, "DELETE")) {
      loadCustomers(search);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-black text-cream">مدیریت مشتریان</h1>
      <p className="mt-1 text-xs text-sage">
        حساب‌های مشتریان را اینجا بسازید، ویرایش یا حذف کنید.
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
              onKeyDown={(event) => event.key === "Enter" && loadCustomers(search)}
              placeholder="جست‌وجو بر اساس نام، ایمیل یا شماره"
              className={`${inputCls} pr-9`}
            />
          </div>
          <button
            onClick={() => loadCustomers(search)}
            className="rounded-full border border-gold/30 px-4 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
          >
            جست‌وجو
          </button>
          <button
            onClick={() => {
              setCustomerEditId(null);
              setCustomerForm({ ...EMPTY_CUSTOMER });
            }}
            className="flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-xs font-bold text-[#241a05]"
          >
            <Plus size={14} /> مشتری جدید
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
                    <p className="mt-0.5 truncate text-xs text-gold-soft">{customer.email}</p>
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
                      onClick={() => {
                        setCustomerEditId(customer.id);
                        setCustomerForm({
                          name: customer.name,
                          email: customer.email,
                          phone: customer.phone,
                          address: customer.address,
                          password: "",
                        });
                      }}
                      className="rounded-lg border border-gold/25 p-2 text-gold-soft hover:bg-gold/10"
                      aria-label="ویرایش"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteCustomer(customer)}
                      className="rounded-lg border border-red-400/25 p-2 text-red-400 hover:bg-red-400/10"
                      aria-label="حذف"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {customerForm && (
        <Modal
          title={customerEditId ? "ویرایش مشتری" : "مشتری جدید"}
          onClose={() => {
            setCustomerForm(null);
            setCustomerEditId(null);
          }}
        >
          <div className="space-y-3">
            <Field label="نام و نام خانوادگی">
              <input
                className={inputCls}
                value={customerForm.name}
                onChange={(event) =>
                  setCustomerForm({ ...customerForm, name: event.target.value })
                }
              />
            </Field>
            <Field label="ایمیل">
              <input
                dir="ltr"
                className={inputCls}
                value={customerForm.email}
                onChange={(event) =>
                  setCustomerForm({ ...customerForm, email: event.target.value })
                }
              />
            </Field>
            <Field label="شماره تماس">
              <input
                dir="ltr"
                className={inputCls}
                value={customerForm.phone}
                onChange={(event) =>
                  setCustomerForm({ ...customerForm, phone: event.target.value })
                }
              />
            </Field>
            <Field label="نشانی">
              <textarea
                rows={2}
                className={inputCls}
                value={customerForm.address}
                onChange={(event) =>
                  setCustomerForm({ ...customerForm, address: event.target.value })
                }
              />
            </Field>
            <Field label={customerEditId ? "رمز عبور جدید (اختیاری)" : "رمز عبور"}>
              <input
                dir="ltr"
                type="password"
                autoComplete="new-password"
                className={inputCls}
                value={customerForm.password}
                onChange={(event) =>
                  setCustomerForm({ ...customerForm, password: event.target.value })
                }
              />
            </Field>
          </div>
          <button
            onClick={saveCustomer}
            disabled={busy}
            className="mt-5 w-full rounded-full bg-gold py-3 text-sm font-bold text-[#241a05] disabled:opacity-60"
          >
            {busy ? "در حال ذخیره…" : "ذخیره"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-gold-soft">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gold/25 bg-forest p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-cream">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-gold/25 p-1.5 text-gold"
            aria-label="بستن"
          >
            <X size={14} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
