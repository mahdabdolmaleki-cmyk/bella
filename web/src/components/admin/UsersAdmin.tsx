"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Users, ShieldCheck, X, Search } from "lucide-react";
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

export type AdminAccount = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "viewer";
  active: boolean;
  lastLoginAt: string | Date | null;
  lastLoginIp: string;
  createdAt: string | Date;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "مالک",
  admin: "مدیر",
  viewer: "فقط مشاهده",
};

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fa-IR", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const inputCls =
  "w-full rounded-xl glass-input px-4 py-2.5 text-sm text-cream placeholder:text-sage/50 focus:border-gold focus:outline-none";

type CustomerForm = { name: string; email: string; phone: string; address: string; password: string };
type AdminForm = { name: string; email: string; role: AdminAccount["role"]; password: string; active: boolean };

const EMPTY_CUSTOMER: CustomerForm = { name: "", email: "", phone: "", address: "", password: "" };
const EMPTY_ADMIN: AdminForm = { name: "", email: "", role: "admin", password: "", active: true };

export default function UsersAdmin({ canManageAdmins }: { canManageAdmins: boolean }) {
  const [tab, setTab] = useState<"customers" | "admins">("customers");

  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [customerForm, setCustomerForm] = useState<CustomerForm | null>(null);
  const [customerEditId, setCustomerEditId] = useState<string | null>(null);
  const [adminForm, setAdminForm] = useState<AdminForm | null>(null);
  const [adminEditId, setAdminEditId] = useState<string | null>(null);

  const loadCustomers = useCallback(async (q = "") => {
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCustomers(data.users ?? []);
    } catch {
      setError("خطا در دریافت فهرست مشتریان.");
      setCustomers([]);
    }
  }, []);

  const loadAdmins = useCallback(async () => {
    if (!canManageAdmins) return;
    try {
      const res = await fetch("/api/admin/admins");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAdmins(data.admins ?? []);
    } catch {
      setAdmins([]);
    }
  }, [canManageAdmins]);

  useEffect(() => {
    loadCustomers();
    loadAdmins();
  }, [loadCustomers, loadAdmins]);

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

  /* ---------------- customers ---------------- */
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

  const deleteCustomer = async (c: Customer) => {
    if (!confirm(`حساب «${c.name}» حذف شود؟ سفارش‌های ثبت‌شده باقی می‌مانند.`)) return;
    if (await send(`/api/admin/users/${c.id}`, "DELETE")) loadCustomers(search);
  };

  /* ---------------- admins ---------------- */
  const saveAdmin = async () => {
    if (!adminForm) return;
    const payload: Record<string, unknown> = {
      name: adminForm.name,
      email: adminForm.email,
      role: adminForm.role,
      active: adminForm.active,
    };
    if (adminForm.password) payload.password = adminForm.password;

    const ok = adminEditId
      ? await send(`/api/admin/admins/${adminEditId}`, "PATCH", payload)
      : await send("/api/admin/admins", "POST", payload);

    if (ok) {
      setAdminForm(null);
      setAdminEditId(null);
      loadAdmins();
    }
  };

  const deleteAdmin = async (a: AdminAccount) => {
    if (!confirm(`حساب مدیریتی «${a.name}» حذف شود؟`)) return;
    if (await send(`/api/admin/admins/${a.id}`, "DELETE")) loadAdmins();
  };

  return (
    <div>
      <h1 className="text-xl font-black text-cream">مدیریت کاربران</h1>
      <p className="mt-1 text-xs text-sage">حساب‌های مشتریان و حساب‌های مدیریتی را اینجا بسازید، ویرایش یا حذف کنید.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setTab("customers")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${
            tab === "customers" ? "bg-gold text-[#241a05]" : "border border-gold/25 text-sage"
          }`}
        >
          <Users size={14} /> مشتریان ({(customers?.length ?? 0).toLocaleString("fa-IR")})
        </button>
        {canManageAdmins && (
          <button
            onClick={() => setTab("admins")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${
              tab === "admins" ? "bg-gold text-[#241a05]" : "border border-gold/25 text-sage"
            }`}
          >
            <ShieldCheck size={14} /> حساب‌های مدیریت ({(admins?.length ?? 0).toLocaleString("fa-IR")})
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      {/* ---------------- customers ---------------- */}
      {tab === "customers" && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-sage/60" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadCustomers(search)}
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
              {customers.map((c) => (
                <div key={c.id} className="gold-ring rounded-2xl glass-panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-cream">{c.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gold-soft">{c.email}</p>
                      <p className="mt-0.5 text-[11px] text-sage">
                        {c.phone || "بدون شماره"} · عضویت: {fmtDate(c.createdAt)}
                      </p>
                      {c.address && <p className="mt-1 text-[11px] leading-5 text-sage">{c.address}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-gold/20 px-2.5 py-1 text-[10px] text-sage">
                        {c.orderCount.toLocaleString("fa-IR")} سفارش · {formatToman(c.totalSpent)}
                      </span>
                      <button
                        onClick={() => {
                          setCustomerEditId(c.id);
                          setCustomerForm({
                            name: c.name,
                            email: c.email,
                            phone: c.phone,
                            address: c.address,
                            password: "",
                          });
                        }}
                        className="rounded-lg border border-gold/25 p-2 text-gold-soft hover:bg-gold/10"
                        aria-label="ویرایش"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteCustomer(c)}
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
      )}

      {/* ---------------- admins ---------------- */}
      {tab === "admins" && canManageAdmins && (
        <div className="mt-5">
          <button
            onClick={() => {
              setAdminEditId(null);
              setAdminForm({ ...EMPTY_ADMIN });
            }}
            className="flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-xs font-bold text-[#241a05]"
          >
            <Plus size={14} /> حساب مدیریتی جدید
          </button>

          {!admins ? (
            <div className="mt-6 flex items-center gap-2 text-sage">
              <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
            </div>
          ) : admins.length === 0 ? (
            <p className="mt-6 text-sm text-sage">
              هنوز حساب مدیریتی ساخته نشده است. تا وقتی حسابی نسازید، ورود با رمز محیطی (ADMIN_PASSWORD) انجام می‌شود.
            </p>
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              {admins.map((a) => (
                <div key={a.id} className="gold-ring rounded-2xl glass-panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-cream">{a.name}</p>
                        <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-soft">
                          {ROLE_LABEL[a.role]}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            a.active
                              ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-300"
                              : "border-red-400/30 bg-red-400/10 text-red-400"
                          }`}
                        >
                          {a.active ? "فعال" : "غیرفعال"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gold-soft">{a.email}</p>
                      <p className="mt-0.5 text-[11px] text-sage">
                        آخرین ورود: {fmtDate(a.lastLoginAt)} · آی‌پی: {a.lastLoginIp || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setAdminEditId(a.id);
                          setAdminForm({
                            name: a.name,
                            email: a.email,
                            role: a.role,
                            active: a.active,
                            password: "",
                          });
                        }}
                        className="rounded-lg border border-gold/25 p-2 text-gold-soft hover:bg-gold/10"
                        aria-label="ویرایش"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteAdmin(a)}
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
      )}

      {/* ---------------- customer modal ---------------- */}
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
                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
              />
            </Field>
            <Field label="ایمیل">
              <input
                dir="ltr"
                className={inputCls}
                value={customerForm.email}
                onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
              />
            </Field>
            <Field label="شماره تماس">
              <input
                dir="ltr"
                className={inputCls}
                value={customerForm.phone}
                onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
              />
            </Field>
            <Field label="نشانی">
              <textarea
                rows={2}
                className={inputCls}
                value={customerForm.address}
                onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
              />
            </Field>
            <Field label={customerEditId ? "رمز عبور جدید (اختیاری)" : "رمز عبور"}>
              <input
                dir="ltr"
                type="password"
                autoComplete="new-password"
                className={inputCls}
                value={customerForm.password}
                onChange={(e) => setCustomerForm({ ...customerForm, password: e.target.value })}
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

      {/* ---------------- admin modal ---------------- */}
      {adminForm && (
        <Modal
          title={adminEditId ? "ویرایش حساب مدیریتی" : "حساب مدیریتی جدید"}
          onClose={() => {
            setAdminForm(null);
            setAdminEditId(null);
          }}
        >
          <div className="space-y-3">
            <Field label="نام">
              <input
                className={inputCls}
                value={adminForm.name}
                onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
              />
            </Field>
            <Field label="ایمیل">
              <input
                dir="ltr"
                className={inputCls}
                value={adminForm.email}
                onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
              />
            </Field>
            <Field label="نقش">
              <select
                className={inputCls}
                value={adminForm.role}
                onChange={(e) =>
                  setAdminForm({ ...adminForm, role: e.target.value as AdminAccount["role"] })
                }
              >
                <option value="owner">مالک (دسترسی کامل)</option>
                <option value="admin">مدیر (بدون مدیریت حساب‌های مدیریتی)</option>
                <option value="viewer">فقط مشاهده</option>
              </select>
            </Field>
            <Field label={adminEditId ? "رمز عبور جدید (اختیاری)" : "رمز عبور"}>
              <input
                dir="ltr"
                type="password"
                autoComplete="new-password"
                className={inputCls}
                value={adminForm.password}
                onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-xs text-sage">
              <input
                type="checkbox"
                checked={adminForm.active}
                onChange={(e) => setAdminForm({ ...adminForm, active: e.target.checked })}
              />
              حساب فعال باشد
            </label>
          </div>
          <button
            onClick={saveAdmin}
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
          <button onClick={onClose} className="rounded-full border border-gold/25 p-1.5 text-gold" aria-label="بستن">
            <X size={14} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
