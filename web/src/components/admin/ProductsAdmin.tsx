"use client";
import { useRef, useState, type ReactNode } from "react";
import { Plus, Pencil, Trash2, X, Eye, EyeOff, Star, Upload, ImageOff, Loader2 } from "lucide-react";
import { formatToman } from "@/lib/data";
import { ProductVisual } from "@/components/art";
import type { Product } from "@/lib/types";

// دسته‌بندی‌های پیش‌فرض فقط زمانی استفاده می‌شوند که ادمین هنوز دستهٔ خودش را
// در تنظیمات نساخته باشد. لیست واقعی از طریق prop به این کامپوننت می‌رسد.
const DEFAULT_CATEGORIES = ["زنانه", "مردانه", "یونیسکس"];

const EMPTY_FORM = {
  name: "",
  nameEn: "",
  tagline: "",
  description: "",
  topNotes: "",
  heartNotes: "",
  baseNotes: "",
  longevity: "",
  sillage: "",
  price: "",
  oldPrice: "",
  sizeMl: "100",
  stock: "0",
  allowBackorder: false,
  glass: "#0e3b26",
  liquid: "#d4af37",
  category: DEFAULT_CATEGORIES[0],
  badge: "",
  bestseller: false,
  active: true,
  image: "",
  // ---- جدول "ویژگی‌های محصول" ----
  brand: "",
  manufacturer: "",
  suitableFor: "",
  concentration: "",
  originCountry: "",
  madeIn: "",
  scentType: "",
  scentStructure: "",
  season: "",
  longDescription: "",
  gallery: [] as string[],
};

type FormState = typeof EMPTY_FORM;

function productToForm(p: Product): FormState {
  return {
    name: p.name,
    nameEn: p.nameEn,
    tagline: p.tagline,
    description: p.description,
    topNotes: p.topNotes,
    heartNotes: p.heartNotes,
    baseNotes: p.baseNotes,
    longevity: p.longevity,
    sillage: p.sillage,
    price: String(p.price),
    oldPrice: p.oldPrice ? String(p.oldPrice) : "",
    sizeMl: String(p.sizeMl),
    stock: String((p as { stock?: number }).stock ?? 0),
    allowBackorder: Boolean((p as { allowBackorder?: boolean }).allowBackorder),
    glass: p.glass,
    liquid: p.liquid,
    category: p.category,
    badge: p.badge || "",
    bestseller: p.bestseller,
    active: p.active,
    image: p.image || "",
    brand: p.brand || "",
    manufacturer: p.manufacturer || "",
    suitableFor: p.suitableFor || "",
    concentration: p.concentration || "",
    originCountry: p.originCountry || "",
    madeIn: p.madeIn || "",
    scentType: p.scentType || "",
    scentStructure: p.scentStructure || "",
    season: p.season || "",
    longDescription: p.longDescription || "",
    gallery: p.gallery ? [...p.gallery] : [],
  };
}

export default function ProductsAdmin({
  initialProducts,
  categories,
}: {
  initialProducts: Product[];
  categories?: string[];
}) {
  // دسته‌بندی‌هایی که ادمین در «تنظیمات ← دسته‌بندی فروشگاه» ساخته است. اگر
  // خالی بود، به سه دستهٔ پیش‌فرض برمی‌گردیم تا فرم هیچ‌وقت بدون گزینه نماند.
  const categoryOptions = categories && categories.length ? categories : DEFAULT_CATEGORIES;
  const [items, setItems] = useState<Product[]>(initialProducts);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setEditing(null);
    // دستهٔ پیش‌فرض محصول تازه = اولین دستهٔ ساخته‌شدهٔ ادمین.
    setForm({ ...EMPTY_FORM, category: categoryOptions[0] });
    setError("");
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm(productToForm(p));
    setError("");
    setFormOpen(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const uploadImage = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "خطا در آپلود عکس.");
        setUploading(false);
        return;
      }
      set("image", data.url);
      setUploading(false);
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
      setUploading(false);
    }
  };

  // Extra photos for the "توضیحات" tab and the thumbnail strip (max 6).
  const uploadGalleryImage = async (file: File) => {
    setError("");
    if (form.gallery.length >= 6) {
      setError("حداکثر ۶ تصویر تکمیلی مجاز است.");
      return;
    }
    setUploadingGallery(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "خطا در آپلود عکس.");
        setUploadingGallery(false);
        return;
      }
      setForm((f) => ({ ...f, gallery: [...f.gallery, data.url].slice(0, 6) }));
      setUploadingGallery(false);
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
      setUploadingGallery(false);
    }
  };

  const removeGalleryImage = (url: string) =>
    setForm((f) => ({ ...f, gallery: f.gallery.filter((item) => item !== url) }));

  const submit = async () => {
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      price: Number(form.price),
      stock: Number(form.stock) || 0,
      allowBackorder: form.allowBackorder,
      oldPrice: form.oldPrice ? Number(form.oldPrice) : null,
      sizeMl: Number(form.sizeMl),
      badge: form.badge || null,
      image: form.image || null,
      gallery: form.gallery,
    };
    try {
      const res = await fetch(
        editing ? `/api/admin/products/${editing.id}` : "/api/admin/products",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "خطا در ذخیره محصول.");
        setSaving(false);
        return;
      }
      if (editing) {
        setItems((list) => list.map((p) => (p.id === editing.id ? data.product : p)));
      } else {
        setItems((list) => [...list, data.product]);
      }
      setFormOpen(false);
      setSaving(false);
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
      setSaving(false);
    }
  };

  const toggleActive = async (p: Product) => {
    const res = await fetch(`/api/admin/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    const data = await res.json();
    if (res.ok) {
      setItems((list) => list.map((x) => (x.id === p.id ? data.product : x)));
    }
  };

  const remove = async (p: Product) => {
    if (!confirm(`محصول «${p.name}» برای همیشه حذف شود؟`)) return;
    const res = await fetch(`/api/admin/products/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((list) => list.filter((x) => x.id !== p.id));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-cream">محصولات</h1>
          <p className="mt-1 text-sm text-sage">{items.length.toLocaleString("fa-IR")} محصول</p>
        </div>
        <button
          onClick={openCreate}
          className="shimmer-btn flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-[#241a05]"
        >
          <Plus size={16} />
          محصول جدید
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <div
            key={p.id}
            className={`gold-ring rounded-2xl border p-4 ${
              p.active ? "border-gold/20 glass-soft" : "border-sage/15 glass-soft opacity-60"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="h-16 w-11 shrink-0">
                <ProductVisual image={p.image} glass={p.glass} liquid={p.liquid} alt={p.name} className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-cream">{p.name}</p>
                <p className="truncate text-[11px] text-sage">{p.nameEn}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  <span className="font-bold text-gold">{formatToman(p.price)}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      ((p as { stock?: number }).stock ?? 0) > 0
                        ? "border-emerald-400/30 text-emerald-300"
                        : "border-red-400/30 text-red-300"
                    }`}
                  >
                    موجودی: {(((p as { stock?: number }).stock ?? 0)).toLocaleString("fa-IR")}
                  </span>
                  {p.oldPrice && (
                    <span className="text-[10px] text-sage line-through">{formatToman(p.oldPrice)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-gold/20 px-2 py-0.5 text-[10px] text-sage">
                {p.category}
              </span>
              {p.badge && (
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">
                  {p.badge}
                </span>
              )}
              {p.bestseller && (
                <span className="flex items-center gap-0.5 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">
                  <Star size={10} /> پرفروش
                </span>
              )}
              {!p.active && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">
                  مخفی
                </span>
              )}
            </div>

            <div className="mt-3 flex items-center gap-1.5 border-t border-gold/10 pt-3">
              <button
                onClick={() => openEdit(p)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gold/25 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
              >
                <Pencil size={13} /> ویرایش
              </button>
              <button
                onClick={() => toggleActive(p)}
                title={p.active ? "مخفی کردن از فروشگاه" : "نمایش در فروشگاه"}
                className="flex items-center justify-center rounded-lg border border-gold/25 p-2 text-gold-soft hover:bg-gold/10"
              >
                {p.active ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                onClick={() => remove(p)}
                title="حذف محصول"
                className="flex items-center justify-center rounded-lg border border-red-400/25 p-2 text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="gold-ring flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-gold/25 bg-night sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-gold/15 px-6 py-4">
              <h2 className="text-base font-black text-cream">
                {editing ? "ویرایش محصول" : "افزودن محصول جدید"}
              </h2>
              <button onClick={() => setFormOpen(false)} className="text-sage hover:text-gold">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-pine/30 to-night">
                  <ProductVisual
                    image={form.image}
                    glass={form.glass}
                    liquid={form.liquid}
                    className="h-full w-full"
                  />
                </div>

                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-bold text-sage">عکس محصول</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadImage(file);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 rounded-lg border border-gold/25 px-3.5 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10 disabled:opacity-60"
                    >
                      {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {uploading ? "در حال آپلود…" : form.image ? "تعویض عکس" : "انتخاب عکس"}
                    </button>
                    {form.image && (
                      <button
                        type="button"
                        onClick={() => set("image", "")}
                        className="flex items-center gap-1.5 rounded-lg border border-red-400/25 px-3.5 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10"
                      >
                        <ImageOff size={14} />
                        حذف عکس
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 text-[10px] text-sage">
                    jpg، png، webp یا gif — حداکثر ۵ مگابایت. اگر عکسی انتخاب نکنی، از بطری طراحی‌شده‌ی زیر استفاده می‌شه.
                  </p>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11px] font-bold text-sage hover:text-gold-soft">
                      رنگ‌های بطری پیش‌فرض (در صورت نبود عکس)
                    </summary>
                    <div className="mt-2 flex gap-3">
                      <div className="flex-1">
                        <label className="mb-1 block text-[11px] font-bold text-sage">رنگ شیشه</label>
                        <input
                          type="color"
                          value={form.glass}
                          onChange={(e) => set("glass", e.target.value)}
                          className="h-10 w-full rounded-lg border border-gold/25 bg-transparent"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-[11px] font-bold text-sage">رنگ مایع عطر</label>
                        <input
                          type="color"
                          value={form.liquid}
                          onChange={(e) => set("liquid", e.target.value)}
                          className="h-10 w-full rounded-lg border border-gold/25 bg-transparent"
                        />
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Field label="نام فارسی">
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
                </Field>
                <Field label="نام انگلیسی">
                  <input value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} className={inputCls} />
                </Field>
              </div>

              <Field label="شعار کوتاه" className="mt-3">
                <input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} className={inputCls} />
              </Field>

              <Field label="توضیحات محصول" className="mt-3">
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="توضیحات کامل (تب «توضیحات» صفحه محصول)" className="mt-3">
                <textarea
                  rows={7}
                  value={form.longDescription}
                  onChange={(e) => set("longDescription", e.target.value)}
                  placeholder="متن بلند معرفی محصول — داستان رایحه، موارد مصرف، نکات نگهداری…"
                  className={inputCls}
                />
                <p className="mt-1 text-[10px] text-sage/70">
                  هر خط خالی یک پاراگراف جدید می‌سازد. حداکثر ۶۰۰۰ کاراکتر.
                </p>
              </Field>

              {/* ---------- گالری تصاویر ---------- */}
              <div className="mt-4 rounded-xl glass-panel p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11.5px] font-bold text-gold-soft">تصاویر تکمیلی</p>
                    <p className="mt-0.5 text-[10px] text-sage/70">
                      در نوار تصویر کوچک و در تب توضیحات نمایش داده می‌شوند (حداکثر ۶ عدد).
                    </p>
                  </div>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadGalleryImage(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={uploadingGallery || form.gallery.length >= 6}
                    className="flex items-center gap-1.5 rounded-lg border border-gold/25 px-3.5 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10 disabled:opacity-50"
                  >
                    {uploadingGallery ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Upload size={14} />
                    )}
                    افزودن تصویر
                  </button>
                </div>

                {form.gallery.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.gallery.map((src) => (
                      <div
                        key={src}
                        className="relative h-20 w-16 overflow-hidden rounded-lg border border-gold/20"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeGalleryImage(src)}
                          title="حذف تصویر"
                          className="absolute top-1 left-1 rounded-full bg-night/85 p-1 text-red-300 hover:text-red-200"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="نُت‌های سر">
                  <input value={form.topNotes} onChange={(e) => set("topNotes", e.target.value)} className={inputCls} />
                </Field>
                <Field label="نُت‌های میانی">
                  <input value={form.heartNotes} onChange={(e) => set("heartNotes", e.target.value)} className={inputCls} />
                </Field>
                <Field label="نُت‌های پایه">
                  <input value={form.baseNotes} onChange={(e) => set("baseNotes", e.target.value)} className={inputCls} />
                </Field>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="ماندگاری">
                  <input value={form.longevity} onChange={(e) => set("longevity", e.target.value)} className={inputCls} />
                </Field>
                <Field label="پخش بو">
                  <input value={form.sillage} onChange={(e) => set("sillage", e.target.value)} className={inputCls} />
                </Field>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="قیمت فعلی (تومان)">
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="قیمت قبل از تخفیف (اختیاری)">
                  <input
                    type="number"
                    value={form.oldPrice}
                    onChange={(e) => set("oldPrice", e.target.value)}
                    placeholder="برای غیرفعال کردن تخفیف خالی بگذارید"
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="موجودی انبار (عدد)">
                  <input
                    type="number"
                    min={0}
                    value={form.stock}
                    onChange={(e) => set("stock", e.target.value)}
                    className={inputCls}
                  />
                  <p className="mt-1 text-[10px] text-sage/70">
                    فقط در پنل دیده می‌شود؛ مشتری فقط «موجود / ناموجود» را می‌بیند.
                  </p>
                </Field>
                <Field label="فروش بدون موجودی (پیش‌فروش)">
                  <label className="flex h-[42px] items-center gap-2 text-xs font-bold text-sage">
                    <input
                      type="checkbox"
                      checked={form.allowBackorder}
                      onChange={(e) => set("allowBackorder", e.target.checked)}
                      className="h-4 w-4 accent-[#d4af37]"
                    />
                    حتی با موجودی صفر قابل سفارش باشد
                  </label>
                </Field>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="حجم (میلی‌لیتر)">
                  <input
                    type="number"
                    value={form.sizeMl}
                    onChange={(e) => set("sizeMl", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="دسته‌بندی">
                  <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
                    {(categoryOptions.includes(form.category)
                      ? categoryOptions
                      : [form.category, ...categoryOptions].filter(Boolean)
                    ).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="برچسب (مثلاً «تخفیف جشنواره»)">
                  <input
                    value={form.badge}
                    onChange={(e) => set("badge", e.target.value)}
                    placeholder="اختیاری"
                    className={inputCls}
                  />
                </Field>
              </div>

              {/* ---------- جدول ویژگی‌های محصول ---------- */}
              <div className="mt-5 rounded-xl glass-panel p-3.5">
                <p className="text-[11.5px] font-bold text-gold-soft">ویژگی‌های محصول</p>
                <p className="mt-0.5 text-[10px] text-sage/70">
                  هر فیلد خالی در جدول صفحه محصول نمایش داده نمی‌شود.
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="شرکت سازنده">
                    <input
                      value={form.manufacturer}
                      onChange={(e) => set("manufacturer", e.target.value)}
                      placeholder="مانند: ژاک بومن"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="برند سازنده">
                    <input
                      value={form.brand}
                      onChange={(e) => set("brand", e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="مناسب برای">
                    <input
                      value={form.suitableFor}
                      onChange={(e) => set("suitableFor", e.target.value)}
                      placeholder="مانند: آقایان / بانوان / هر دو"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="نوع غلظت">
                    <input
                      value={form.concentration}
                      onChange={(e) => set("concentration", e.target.value)}
                      placeholder="مانند: ادو پرفوم"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="کشور م��دأ برند">
                    <input
                      value={form.originCountry}
                      onChange={(e) => set("originCountry", e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="کشور سازنده">
                    <input
                      value={form.madeIn}
                      onChange={(e) => set("madeIn", e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="نوع رایحه">
                    <input
                      value={form.scentType}
                      onChange={(e) => set("scentType", e.target.value)}
                      placeholder="مانند: چوبی ادویه‌ای"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="ساختار رایحه">
                    <input
                      value={form.scentStructure}
                      onChange={(e) => set("scentStructure", e.target.value)}
                      placeholder="مانند: سه لایه‌ای (سر، میانی، پایه)"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="فصل پیشنهادی">
                    <input
                      value={form.season}
                      onChange={(e) => set("season", e.target.value)}
                      placeholder="مانند: پاییز و زمستان"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 text-xs font-bold text-sage">
                  <input
                    type="checkbox"
                    checked={form.bestseller}
                    onChange={(e) => set("bestseller", e.target.checked)}
                    className="h-4 w-4 accent-[#d4af37]"
                  />
                  نمایش در «پرفروش‌ترین‌ها»
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-sage">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => set("active", e.target.checked)}
                    className="h-4 w-4 accent-[#d4af37]"
                  />
                  نمایش در فروشگاه (فعال)
                </label>
              </div>

              {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            </div>

            <div className="flex items-center gap-3 border-t border-gold/15 px-6 py-4">
              <button
                onClick={() => setFormOpen(false)}
                className="btn-ghost flex-1 rounded-full py-2.5 text-sm font-bold"
              >
                انصراف
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="btn-emerald flex-1 rounded-full py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {saving ? "در حال ذخیره…" : editing ? "ذخیره تغییرات" : "افزودن محصول"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl glass-input px-3.5 py-2.5 text-sm text-cream placeholder:text-sage/40 focus:border-gold focus:outline-none";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-bold text-sage">{label}</label>
      {children}
    </div>
  );
}
