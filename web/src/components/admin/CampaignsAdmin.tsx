"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PartyPopper,
  Loader2,
  CheckSquare,
  Square,
  Tag as TagIcon,
  ChevronDown,
  Ticket,
  BadgePercent,
  Search,
  Save,
  Trash2,
} from "lucide-react";
import { toFa, formatToman } from "@/lib/data";
import { categoryPathName, type CategoryNode } from "@/lib/categories";
import {
  faDigits,
  jalaliDateTimeToMs,
  jalaliToIso,
  msToJalaliDateTime,
  toJalali,
} from "@/lib/jalali";
import { DEFAULT_SETTINGS, type SiteSettingsMap } from "@/lib/settings";

const inputCls =
  "w-full rounded-xl glass-input px-3.5 py-2.5 text-sm text-cream placeholder:text-sage/40 focus:border-gold focus:outline-none";
const selCls =
  "rounded-lg glass-input px-2 py-1.5 text-xs text-cream focus:border-gold focus:outline-none";

type PRow = {
  id: number;
  name: string;
  price: number;
  oldPrice?: number | null;
  category?: string;
  categoryId?: number | null;
  badge?: string | null;
  festival?: boolean;
  discount?: boolean;
  discountType?: "" | "percent" | "amount";
  discountValue?: number | null;
  active?: boolean;
};
type CRow = { code?: string; percent?: number; amount?: number; until?: string };
type TabId = "festival" | "discounts" | "coupons";

const J_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

/* ── ورودی تایمر شمسی (به وقت تهران) ─────────────────────────────── */
function JalaliTimerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ms = Number(value) || 0;
  const now = msToJalaliDateTime(Date.now()) ?? { jy: 1404, jm: 1, jd: 1, hh: 0, mm: 0 };
  const cur = (ms ? msToJalaliDateTime(ms) : null) ?? now;
  const enabled = ms > 0;
  const setPart = (patch: Partial<typeof cur>) => {
    const n = { ...cur, ...patch };
    const t = jalaliDateTimeToMs(n.jy, n.jm, n.jd, n.hh, n.mm);
    onChange(t ? String(t) : "");
  };
  const years: number[] = [];
  for (let y = now.jy - 1; y <= now.jy + 5; y++) years.push(y);
  return (
    <div className="rounded-xl border border-gold/15 glass-soft p-3">
      <label className="flex items-center gap-2 text-xs font-bold text-sage">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? String(jalaliDateTimeToMs(now.jy, now.jm, now.jd, now.hh, now.mm) ?? "")
                : "",
            )
          }
          className="h-4 w-4 accent-[#d4af7c]"
        />
        تایمر پایان جشنواره داشته باشد
      </label>
      {enabled ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <select value={cur.jy} onChange={(e) => setPart({ jy: +e.target.value })} className={selCls}>
            {years.map((y) => (
              <option key={y} value={y}>{faDigits(y)}</option>
            ))}
          </select>
          <select value={cur.jm} onChange={(e) => setPart({ jm: +e.target.value })} className={selCls}>
            {J_MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select value={cur.jd} onChange={(e) => setPart({ jd: +e.target.value })} className={selCls}>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{faDigits(i + 1)}</option>
            ))}
          </select>
          <span className="text-[11px] text-sage">ساعت</span>
          <select value={cur.hh} onChange={(e) => setPart({ hh: +e.target.value })} className={selCls}>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{faDigits(String(i).padStart(2, "0"))}</option>
            ))}
          </select>
          <span className="text-[11px] text-sage">:</span>
          <select value={cur.mm} onChange={(e) => setPart({ mm: +e.target.value })} className={selCls}>
            {Array.from({ length: 60 }, (_, i) => (
              <option key={i} value={i}>{faDigits(String(i).padStart(2, "0"))}</option>
            ))}
          </select>
          <span className="text-[10px] text-sage/70">به وقت تهران</span>
        </div>
      ) : (
        <p className="mt-1.5 text-[10.5px] leading-5 text-sage/70">
          بدون تایمر ⇒ بنر جشنواره همیشگی است و products همیشه در جشنواره می‌مانند.
        </p>
      )}
    </div>
  );
}

/* ── انتخاب محصول (جستجو + گروه‌بندی دسته با نام کامل) ───────────── */
function ProductPicker({
  rows, catTree, selected, onToggle, onToggleCat, search, setSearch,
}: {
  rows: PRow[];
  catTree: CategoryNode[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleCat: (ids: number[]) => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const filtered = useMemo(
    () => rows.filter((p) => !search.trim() || p.name.includes(search.trim())),
    [rows, search],
  );
  const groups = useMemo(() => {
    const m = new Map<number | null, PRow[]>();
    for (const p of filtered) {
      const k = (p.categoryId as number | null) ?? null;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()];
  }, [filtered]);
  const toggleOpen = (k: string) =>
    setOpenCats((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <div className="rounded-2xl border border-gold/10 bg-gold/[0.02]">
      <div className="flex items-center gap-2 border-b border-gold/10 p-2.5">
        <Search size={14} className="text-sage" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجوی محصول…"
          className="w-full bg-transparent text-xs text-cream placeholder:text-sage/40 focus:outline-none"
        />
      </div>
      <div className="max-h-[420px] space-y-1.5 overflow-y-auto p-2">
        {groups.map(([cid, list]) => {
          const key = String(cid);
          const open = openCats.has(key);
          const ids = list.map((p) => p.id);
          const allSel = ids.every((id) => selected.has(id));
          return (
            <div key={key} className="rounded-xl border border-gold/10">
              <div className="flex items-center justify-between px-2.5 py-2">
                <button onClick={() => toggleOpen(key)} className="flex flex-1 items-center gap-2 text-right">
                  <ChevronDown size={14} className={`text-sage transition-transform ${open ? "rotate-180" : ""}`} />
                  <span className="text-xs font-black text-gold-soft">{categoryPathName(catTree, cid)}</span>
                  <span className="text-[10px] text-sage">({toFa(list.length)})</span>
                </button>
                <button
                  onClick={() => onToggleCat(ids)}
                  className="rounded-full border border-gold/25 px-2 py-0.5 text-[10px] font-bold text-gold-soft hover:bg-gold/10"
                >
                  {allSel ? "لغو دسته" : "کل دسته"}
                </button>
              </div>
              {open && (
                <div className="space-y-1 border-t border-gold/10 p-1.5">
                  {list.map((p) => (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${
                        selected.has(p.id) ? "bg-gold/10" : "hover:bg-gold/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => onToggle(p.id)}
                        className="accent-[#d4af37]"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-cream">{p.name}</span>
                      <span className="text-[10px] text-sage">{formatToman(p.price)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="py-6 text-center text-xs text-sage">محصولی یافت نشد.</p>}
      </div>
    </div>
  );
}

export default function CampaignsAdmin() {
  const [tab, setTab] = useState<TabId>("festival");
  const [rows, setRows] = useState<PRow[]>([]);
  const [catTree, setCatTree] = useState<CategoryNode[]>([]);
  const [form, setForm] = useState<SiteSettingsMap>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  // تنظیمات اعمال تخفیف / تگ جشنواره
  const [discMode, setDiscMode] = useState<"percent" | "toman">("percent");
  const [discValue, setDiscValue] = useState("");
  const [festTag, setFestTag] = useState("جشنواره");
  const [couponDateDraft, setCouponDateDraft] = useState<Record<number, string>>({});

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3500);
  };
  const set = (key: keyof SiteSettingsMap, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, sr, cr] = await Promise.all([
        fetch("/api/admin/products?limit=1000"),
        fetch("/api/admin/settings"),
        fetch("/api/categories"),
      ]);
      if (pr.ok) setRows((await pr.json()).products || []);
      if (sr.ok) {
        const s = (await sr.json()).settings;
        if (s) setForm((f) => ({ ...f, ...s }));
      }
      if (cr.ok) setCatTree((await cr.json()).categories || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleCat = (ids: number[]) =>
    setSelected((s) => {
      const n = new Set(s);
      const allSel = ids.every((id) => n.has(id));
      ids.forEach((id) => (allSel ? n.delete(id) : n.add(id)));
      return n;
    });
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((p) => p.id)));

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) flash(d.error || "خطا در ذخیرهٔ تنظیمات.");
      else {
        if (d.settings) setForm((f) => ({ ...f, ...d.settings }));
        flash("تنظیمات ذخیره شد.");
      }
    } catch {
      flash("خطا در برقراری ارتباط با سرور.");
    } finally {
      setSavingSettings(false);
    }
  };

  const apply = async (
    field: "festival" | "discount",
    value: boolean,
    opts: { all?: boolean; ids?: number[] } = {},
  ) => {
    const all = opts.all === true;
    const useIds = opts.ids ?? [...selected];
    if (!all && useIds.length === 0) {
      flash("ابتدا یک یا چند محصول را انتخاب کنید.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = all ? { all: true } : { ids: useIds };
      body[field] = value;
      if (field === "festival" && value) body.badge = festTag.trim() || "جشنواره";
      if (field === "discount" && value) {
        const v = Number(discValue);
        if (discValue && Number.isFinite(v) && v > 0) {
          if (discMode === "percent") body.discountPercent = v;
          else body.discountAmount = v;
        }
      }
      const r = await fetch("/api/admin/products/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) flash(d.error || "خطا در اعمال تغییر.");
      else if ((d.count ?? 0) === 0) {
        flash("هیچ محصولی به‌روزرسانی نشد؛ لطفاً دوباره محصول انتخاب کنید.");
      } else {
        flash(`${toFa(d.count)} محصول به‌روزرسانی شد.`);
        if (!opts.ids) setSelected(new Set());
        await load();
      }
    } catch {
      flash("خطا در برقراری ارتباط با سرور.");
    } finally {
      setBusy(false);
    }
  };

  // جشنواره همیشه شامل تخفیف است: یک درخواست، هر دو فیلد را اعمال/حذف می‌کند.
  const applyFestival = async (on: boolean, all = false) => {
    const useIds = [...selected];
    if (!all && useIds.length === 0) {
      flash("ابتدا یک یا چند محصول را انتخاب کنید.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = all ? { all: true } : { ids: useIds };
      body.festival = on;
      body.discount = on;
      if (on) {
        body.badge = festTag.trim() || "جشنواره";
        const v = Number(discValue);
        if (discValue && Number.isFinite(v) && v > 0) {
          if (discMode === "percent") body.discountPercent = v;
          else body.discountAmount = v;
        }
      }
      const r = await fetch("/api/admin/products/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) flash(d.error || "خطا در اعمال تغییر.");
      else if ((d.count ?? 0) === 0) flash("هیچ محصولی به‌روزرسانی نشد؛ لطفاً دوباره محصول انتخاب کنید.");
      else {
        flash(`${toFa(d.count)} محصول به جشنواره/تخفیف اضافه شد.`);
        if (!all) setSelected(new Set());
        await load();
      }
    } catch {
      flash("خطا در برقراری ارتباط با سرور.");
    } finally {
      setBusy(false);
    }
  };

  const festProducts = rows.filter((p) => p.festival);
  const discProducts = rows.filter((p) => p.discount);

  const ActionBtn = ({ onClick, label, tone }: { onClick: () => void; label: string; tone: "fest" | "disc" | "off" }) => (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-full border px-3.5 py-2 text-[11px] font-bold transition-colors disabled:opacity-50 ${
        tone === "fest"
          ? "border-rose-300/40 text-rose-300 hover:bg-rose-300/10"
          : tone === "disc"
            ? "border-emerald-300/40 text-emerald-300 hover:bg-emerald-300/10"
            : "border-gold/25 text-sage hover:bg-gold/5"
      }`}
    >
      {label}
    </button>
  );

  const Tabs = (
    <div className="mt-4 flex flex-wrap gap-1.5 rounded-full glass-soft p-1">
      {([
        ["festival", "جشنواره", PartyPopper],
        ["discounts", "تخفیف‌ها", BadgePercent],
        ["coupons", "کدهای تخفیف", Ticket],
      ] as const).map(([id, label, Icon]) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-black transition-colors ${
            tab === id ? "bg-gold text-[#241a05]" : "text-sage hover:bg-gold/10"
          }`}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sage">
        <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PartyPopper className="text-gold" size={20} />
          <h1 className="text-lg font-black text-gold">جشنواره و تخفیف‌ها</h1>
        </div>
        <button
          onClick={toggleAll}
          className="inline-flex items-center gap-2 rounded-full border border-gold/25 px-4 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
        >
          {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
          {allSelected ? "لغو انتخاب همه" : "انتخاب همه"}
          <span className="text-sage">({toFa(selected.size)})</span>
        </button>
      </div>

      {msg && <p className="mt-3 text-xs text-gold-soft">{msg}</p>}
      {Tabs}

      {/* ════════════ تب جشنواره ════════════ */}
      {tab === "festival" && (
        <div className="mt-4 space-y-4">
          <section className="gold-ring rounded-2xl glass-panel p-5">
            <h2 className="text-sm font-black text-gold">تنظیمات بنر جشنواره</h2>
            <label className="mt-3 flex items-center gap-2 text-xs font-bold text-sage">
              <input
                type="checkbox"
                checked={form.festivalActive === "true"}
                onChange={(e) => set("festivalActive", e.target.checked ? "true" : "false")}
                className="h-4 w-4 accent-[#d4af7c]"
              />
              نمایش بنر جشنواره در صفحه اصلی
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-sage">عنوان</span>
                <input value={form.festivalTitle} onChange={(e) => set("festivalTitle", e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-sage">توضیح کوتاه</span>
                <input value={form.festivalSubtitle} onChange={(e) => set("festivalSubtitle", e.target.value)} className={inputCls} />
              </label>
            </div>
            <div className="mt-3">
              <span className="mb-1 block text-[11px] font-bold text-sage">تایمر پایان جشنواره (شمسی / تهران)</span>
              <JalaliTimerInput value={form.festivalUntil} onChange={(v) => set("festivalUntil", v)} />
            </div>
            <button onClick={saveSettings} disabled={savingSettings} className="btn-add mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black disabled:opacity-50">
              <Save size={14} /> ذخیرهٔ تنظیمات جشنواره
            </button>
          </section>

          <section className="gold-ring rounded-2xl glass-panel p-5">
            <h2 className="text-sm font-black text-gold">افزودن محصول به جشنواره</h2>
            <p className="mt-1 text-[11px] leading-6 text-sage">
              جشنواره همیشه شامل تخفیف است؛ نوع و مقدار تخفیف را مشخص کنید، سپس با
              «افزودن به جشنواره» هر دو روی محصولات انتخاب‌شده اعمال می‌شود و تگ محصول به
              «تگ جشنواره» تغییر می‌کند.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-sage">
                  <TagIcon size={12} /> تگ جشنواره
                </span>
                <input value={festTag} onChange={(e) => setFestTag(e.target.value)} className={inputCls} placeholder="جشنواره" />
              </label>
              <div>
                <span className="mb-1 block text-[11px] font-bold text-sage">نوع تخفیف</span>
                <div className="flex items-center gap-1 rounded-full glass-soft px-2 py-1">
                  {(["percent", "toman"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setDiscMode(m)}
                      className={`rounded-full px-3 py-1 text-[11px] font-bold ${discMode === m ? "bg-gold/20 text-gold" : "text-sage"}`}
                    >
                      {m === "percent" ? "درصد ٪" : "تومان"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] font-bold text-sage">
                  مقدار تخفیف {discMode === "percent" ? "(درصد)" : "(تومان)"}
                </span>
                <input
                  value={discValue}
                  onChange={(e) => setDiscValue(e.target.value)}
                  type="number"
                  min={0}
                  placeholder={discMode === "percent" ? "مثلاً 20" : "مثلاً 100000"}
                  className={inputCls}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ActionBtn tone="fest" label="＋ افزودن به جشنواره (با تخفیف)" onClick={() => applyFestival(true)} />
              <ActionBtn tone="off" label="－ حذف از جشنواره" onClick={() => applyFestival(false)} />
              <span className="mx-1 h-4 w-px bg-gold/15" />
              <ActionBtn tone="fest" label="جشنوارهٔ همه" onClick={() => applyFestival(true, true)} />
            </div>
          </section>

          <ProductPicker
            rows={rows} catTree={catTree} selected={selected}
            onToggle={toggle} onToggleCat={toggleCat} search={search} setSearch={setSearch}
          />

          <section className="gold-ring rounded-2xl glass-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black text-rose-300">
                جشنواره‌های فعال ({toFa(festProducts.length)})
              </h2>
              {festProducts.length > 0 && (
                <button
                  onClick={() => apply("festival", false, { ids: festProducts.map((p) => p.id) })}
                  disabled={busy}
                  className="rounded-full border border-red-400/50 px-3 py-1 text-[10px] font-bold text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                >
                  حذف همگی از جشنواره
                </button>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              {festProducts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.04] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-cream">{p.name}</span>
                  <span className="rounded-full border border-rose-300/40 bg-rose-300/10 px-2 py-0.5 text-[10px] font-black text-rose-300">{p.badge || "جشنواره"}</span>
                  <span className="text-[10px] text-sage">{formatToman(p.price)}</span>
                  <button
                    onClick={() => apply("festival", false, { ids: [p.id] })}
                    disabled={busy}
                    className="rounded-lg border border-red-400/50 p-1.5 text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                    aria-label="حذف از جشنواره"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {festProducts.length === 0 && <p className="py-4 text-center text-xs text-sage">محصولی در جشنواره نیست.</p>}
            </div>
          </section>
        </div>
      )}

      {/* ════════════ تب تخفیف‌ها ════════════ */}
      {tab === "discounts" && (
        <div className="mt-4 space-y-4">
          <section className="gold-ring rounded-2xl glass-panel p-5">
            <h2 className="text-sm font-black text-emerald-300">تنظیمات کارت تخفیف‌ها</h2>
            <label className="mt-3 flex items-center gap-2 text-xs font-bold text-sage">
              <input
                type="checkbox"
                checked={form.discountsBoxActive === "1"}
                onChange={(e) => set("discountsBoxActive", e.target.checked ? "1" : "")}
                className="h-4 w-4 accent-[#d4af7c]"
              />
              نمایش کارت تخفیف‌ها در صفحه اصلی
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-sage">عنوان</span>
                <input value={form.discountsBoxTitle} onChange={(e) => set("discountsBoxTitle", e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-sage">توضیح کوتاه</span>
                <input value={form.discountsBoxSubtitle} onChange={(e) => set("discountsBoxSubtitle", e.target.value)} className={inputCls} />
              </label>
            </div>
            <button onClick={saveSettings} disabled={savingSettings} className="btn-add mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black disabled:opacity-50">
              <Save size={14} /> ذخیرهٔ تنظیمات تخفیف‌ها
            </button>
          </section>

          {/* ── تخفیف خرید اول + باکس VIP (منتقل‌شده از تنظیمات سایت) ── */}
          <section className="gold-ring rounded-2xl glass-panel p-5">
            <h2 className="text-sm font-black text-gold">تخفیف خرید اول و باکس VIP</h2>
            <label className="mt-3 flex items-center gap-2 text-xs font-bold text-sage">
              <input
                type="checkbox"
                checked={form.firstPurchaseDiscountEnabled === "1"}
                onChange={(e) => set("firstPurchaseDiscountEnabled", e.target.checked ? "1" : "")}
                className="h-4 w-4 accent-[#d4af7c]"
              />
              فعال‌بودن تخفیف خرید اول مشتری
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-[11px] font-bold text-sage">درصد تخفیف (۰ تا ۹۰)</span>
              <input
                value={form.firstPurchasePercent}
                onChange={(e) => set("firstPurchasePercent", e.target.value)}
                type="number"
                min={0}
                max={90}
                className={inputCls}
              />
            </label>
            <div className="mt-4 border-t border-gold/10 pt-3">
              <label className="flex items-center gap-2 text-xs font-bold text-sage">
                <input
                  type="checkbox"
                  checked={form.vipBoxEnabled === "1"}
                  onChange={(e) => set("vipBoxEnabled", e.target.checked ? "1" : "")}
                  className="h-4 w-4 accent-[#d4af7c]"
                />
                فعال‌بودن باکس ویژه (VIP) هنگام خرید
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-sage">هزینهٔ باکس (تومان)</span>
                  <input value={form.vipBoxFee} onChange={(e) => set("vipBoxFee", e.target.value)} type="number" min={0} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-sage">عنوان باکس</span>
                  <input value={form.vipBoxTitle} onChange={(e) => set("vipBoxTitle", e.target.value)} className={inputCls} />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="mb-1 block text-[11px] font-bold text-sage">توضیح باکس (به مشتری)</span>
                <input value={form.vipBoxDesc} onChange={(e) => set("vipBoxDesc", e.target.value)} className={inputCls} />
              </label>
            </div>
            <button onClick={saveSettings} disabled={savingSettings} className="btn-add mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black disabled:opacity-50">
              <Save size={14} /> ذخیرهٔ تخفیف اول و VIP
            </button>
          </section>

          <section className="gold-ring rounded-2xl glass-panel p-5">
            <h2 className="text-sm font-black text-emerald-300">اعمال تخفیف روی محصول</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-[11px] font-bold text-sage">نوع تخفیف</span>
                <div className="flex items-center gap-1 rounded-full glass-soft px-2 py-1">
                  {(["percent", "toman"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setDiscMode(m)}
                      className={`rounded-full px-3 py-1 text-[11px] font-bold ${discMode === m ? "bg-gold/20 text-gold" : "text-sage"}`}
                    >
                      {m === "percent" ? "درصد ٪" : "تومان"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-sage">
                  مقدار {discMode === "percent" ? "(درصد)" : "(تومان)"}
                </span>
                <input
                  value={discValue}
                  onChange={(e) => setDiscValue(e.target.value)}
                  type="number"
                  min={0}
                  placeholder={discMode === "percent" ? "مثلاً 20" : "مثلاً 100000"}
                  className={inputCls}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ActionBtn tone="disc" label="＋ اعمال تخفیف" onClick={() => apply("discount", true)} />
              <ActionBtn tone="off" label="－ حذف تخفیف" onClick={() => apply("discount", false)} />
              <span className="mx-1 h-4 w-px bg-gold/15" />
              <ActionBtn tone="disc" label="تخفیف همه" onClick={() => apply("discount", true, { all: true })} />
            </div>
          </section>

          <ProductPicker
            rows={rows} catTree={catTree} selected={selected}
            onToggle={toggle} onToggleCat={toggleCat} search={search} setSearch={setSearch}
          />

          <section className="gold-ring rounded-2xl glass-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black text-emerald-300">
                تخفیف‌های فعال ({toFa(discProducts.length)})
              </h2>
              {discProducts.length > 0 && (
                <button
                  onClick={() => apply("discount", false, { ids: discProducts.map((p) => p.id) })}
                  disabled={busy}
                  className="rounded-full border border-red-400/50 px-3 py-1 text-[10px] font-bold text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                >
                  حذف همگی تخفیف‌ها
                </button>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              {discProducts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.04] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-cream">{p.name}</span>
                  <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-black text-emerald-300">
                    {p.discountType === "amount" && p.discountValue != null
                      ? `${formatToman(p.discountValue)} تخفیف`
                      : p.discountType === "percent" && p.discountValue != null
                        ? `${toFa(p.discountValue)}٪ تخفیف`
                        : p.oldPrice && p.oldPrice > p.price
                          ? `${toFa(Math.round((1 - p.price / p.oldPrice) * 100))}٪ تخفیف`
                          : "تخفیف"}
                  </span>
                  <span className="text-[10px] text-sage">{formatToman(p.price)}</span>
                  <button
                    onClick={() => apply("discount", false, { ids: [p.id] })}
                    disabled={busy}
                    className="rounded-lg border border-red-400/50 p-1.5 text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                    aria-label="حذف تخفیف"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {discProducts.length === 0 && <p className="py-4 text-center text-xs text-sage">محصولی تخفیف فعال ندارد.</p>}
            </div>
          </section>
        </div>
      )}

      {/* ════════════ تب کدهای تخفیف ════════════ */}
      {tab === "coupons" && (
        <section className="gold-ring mt-4 rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-gold">
            <Ticket size={16} />
            <h2 className="text-sm font-black">کدهای تخفیف</h2>
          </div>
          <label className="mt-4 flex items-center gap-2 text-xs font-bold text-sage">
            <input
              type="checkbox"
              checked={form.couponEnabled === "1"}
              onChange={(e) => set("couponEnabled", e.target.checked ? "1" : "")}
              className="h-4 w-4 accent-[#d4af7c]"
            />
            فعال‌بودن کدهای تخفیف
          </label>
          <p className="mt-1 text-[10.5px] leading-5 text-sage/70">
            هر کد می‌تواند درصدی (۱ تا ۹۰٪) یا مبلغی (تومان) باشد و تا پایان «تاریخ انقضای
            شمسی» معتبر است؛ خالی‌گذاشتن تاریخ یعنی بدون انقضا.
          </p>
          {(() => {
            let list: CRow[] = [];
            try {
              const parsed = JSON.parse(form.couponCodesJson || "[]");
              if (Array.isArray(parsed)) list = parsed;
            } catch {
              /* دادهٔ خراب — با اولین ویرایش بازنویسی می‌شود */
            }
            const write = (next: CRow[]) => set("couponCodesJson", JSON.stringify(next));
            const edit = (i: number, p: Partial<CRow>) =>
              write(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
            const toLatin = (v: string) =>
              v
                .replace(/[\u06F0-\u06F9]/g, (d) => String("۰۱۳۴۵۷۸۹".indexOf(d)))
                .replace(/[\u0660-\u0669]/g, (d) => String("٠١٣٤٥٧٨٩".indexOf(d)));
            const jalStr = (iso: string) => {
              const pp = toJalali(`${iso.slice(0, 10)}T12:00:00`);
              if (!pp) return "";
              const pad = (n: number) => String(n).padStart(2, "0");
              return `${pp.jy}-${pad(pp.jm)}-${pad(pp.jd)}`;
            };
            return (
              <>
                {list.map((c, i) => {
                  const isAmount = !c.percent && (c.amount ?? 0) > 0;
                  const draft = couponDateDraft[i] ?? (c.until ? jalStr(c.until) : "");
                  const onDate = (raw: string) => {
                    setCouponDateDraft((m) => ({ ...m, [i]: raw }));
                    if (!raw.trim()) {
                      edit(i, { until: "" });
                      return;
                    }
                    const m2 = toLatin(raw.trim()).match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})$/);
                    if (m2) {
                      const iso = jalaliToIso(+m2[1], +m2[2], +m2[3]);
                      edit(i, { until: iso ?? c.until ?? "" });
                    }
                  };
                  return (
                    <div key={i} className="mt-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_96px_104px_150px_42px]">
                      <label className="block">
                        <span className="mb-1 block text-[10.5px] font-bold text-sage">کد تخفیف</span>
                        <input
                          value={String(c.code ?? "")}
                          onChange={(e) => edit(i, { code: e.target.value.toUpperCase().replace(/\s+/g, "") })}
                          className={inputCls}
                          dir="ltr"
                          placeholder="BELLA15"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10.5px] font-bold text-sage">نوع</span>
                        <select
                          value={isAmount ? "amount" : "percent"}
                          onChange={(e) => {
                            if (e.target.value === "amount")
                              edit(i, { percent: 0, amount: c.amount ?? Math.max(1000, (c.percent ?? 10) * 5000) });
                            else edit(i, { amount: 0, percent: c.percent ?? 10 });
                          }}
                          className={`${inputCls} appearance-none`}
                        >
                          <option value="percent">درصد</option>
                          <option value="amount">تومان</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10.5px] font-bold text-sage">
                          {isAmount ? "مبلغ (تومان)" : "درصد (۱–۹۰)"}
                        </span>
                        <input
                          type="number"
                          min={isAmount ? 1000 : 1}
                          max={isAmount ? 10000000 : undefined}
                          step={isAmount ? 1000 : 1}
                          value={isAmount ? (c.amount ?? "") : (c.percent ?? "")}
                          onChange={(e) => {
                            const n = Number(e.target.value) || 0;
                            edit(i, isAmount ? { amount: n } : { percent: Math.min(90, n) });
                          }}
                          className={inputCls}
                          dir="ltr"
                          placeholder={isAmount ? "50000" : "15"}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10.5px] font-bold text-sage">تاریخ انقضا (شمسی)</span>
                        <input
                          value={draft}
                          onChange={(e) => onDate(e.target.value)}
                          className={inputCls}
                          dir="ltr"
                          placeholder="1405-07-13"
                          title="قالب: 1405-07-13 — خالی یعنی بدون انقضا"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => write(list.filter((_, j) => j !== i))}
                        className="rounded-lg border border-red-400/50 p-2.5 text-red-400 transition hover:bg-red-400/10"
                        aria-label="حذف کد"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => write([...list, { code: "", percent: 10, until: "" }])}
                  className="btn-add mt-3 rounded-full px-4 py-2 text-[11px] font-bold"
                >
                  + افزودن کد جدید
                </button>
              </>
            );
          })()}
          <button onClick={saveSettings} disabled={savingSettings} className="btn-add mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black disabled:opacity-50">
            <Save size={14} /> ذخیرهٔ کدهای تخفیف
          </button>
        </section>
      )}

      {busy && (
        <div className="mt-3 flex items-center gap-2 text-xs text-sage">
          <Loader2 size={14} className="animate-spin" /> در حال اعمال…
        </div>
      )}
    </div>
  );
}
