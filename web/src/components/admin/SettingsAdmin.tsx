"use client";
import { useMemo, useRef, useState } from "react";
import { jalaliToIso, toJalali } from "@/lib/jalali";
import Image from "next/image";
import {
  Sparkles,
  PenLine,
  Check,
  Gem,
  ScrollText,
  Plus,
  Trash2,
  Tag,
  ImagePlus,
  Loader2,
  RotateCcw,
  GripVertical,
  BadgeCheck,
  Home,
  PanelBottom,
  Shapes,
  ExternalLink,
  AlertCircle,
  BadgePercent,
  LayoutGrid,
  Share2,
  Link2,
  LogIn,
  Mail,
  MessageSquare,
  Smartphone,
  Truck,
  Clock,
  ShoppingBasket,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import {
  parseSocials,
  socialColor,
  SOCIAL_ICON_KEYS,
  SOCIAL_ICON_LABELS,
  type SocialIconKey,
  type SocialLink,
} from "@/lib/socials";
import SocialGlyph from "@/components/SocialGlyph";
import {
  parseBrands,
  parseJourneyStages,
  parseEnamadSeal,
  parseFooterBadges,
  parseShopCategories,
  type BrandCard,
  type FooterBadge,
  type JourneyStage,
  type SiteSettingsMap,
} from "@/lib/settings";
import {
  ICON_NAMES,
  ICON_LABELS,
  SECTION_ICON_KEYS,
  SECTION_ICON_LABELS,
  parseFeatures,
  parseSectionIcons,
  type FeatureCard,
  type IconName,
  type SectionIconKey,
} from "@/lib/icons";
import SiteIcon from "@/components/SiteIcon";
import { DEFAULT_JOURNEY_STAGES } from "@/components/Journey";
import { DEFAULT_BRANDS } from "@/components/HomeSections";

/* ------------------------------------------------------------------ *
 * The settings screen used to be one endless scroll of eight cards.   *
 * It is now split into tabs: each tab is one area of the site, so an  *
 * admin looking for «نماد اعتماد» does not scroll past the loyalty  *
 * club and the bottle colours to find it.                             *
 *                                                                     *
 * All tabs edit the SAME form object and every tab carries its own    *
 * save button, so switching tabs never loses an unsaved edit.         *
 * ------------------------------------------------------------------ */
const TABS = [
  // Login controls come first and open by default; they must not be hidden at
  // the far end of the horizontally scrollable settings tabs.
  { id: "login", label: "روش‌های ورود", icon: LogIn, tint: "text-cyan-300" },
  { id: "home", label: "صفحهٔ اصلی", icon: Home, tint: "text-sky-300" },
  { id: "brands", label: "برندها", icon: Tag, tint: "text-amber-300" },
  { id: "icons", label: "آیکن‌ها و مزیت‌ها", icon: Shapes, tint: "text-fuchsia-300" },
  { id: "footer", label: "فوتر و نمادها", icon: PanelBottom, tint: "text-emerald-300" },
  { id: "loyalty", label: "باشگاه مشتریان", icon: Gem, tint: "text-violet-300" },
  { id: "shipping", label: "ارسال", icon: Truck, tint: "text-sky-300" },
  { id: "categories", label: "دسته‌بندی فروشگاه", icon: LayoutGrid, tint: "text-lime-300" },
  { id: "contact", label: "تماس با ما", icon: Share2, tint: "text-rose-300" },
  { id: "terms", label: "قوانین و مقررات", icon: ScrollText, tint: "text-teal-300" },
  { id: "cart", label: "سبد رها شده", icon: ShoppingBasket, tint: "text-amber-300" },
  { id: "sms", label: "پیامک‌ها و ایمیل‌ها", icon: MessageSquare, tint: "text-lime-300" },
  { id: "maintenance", label: "پرداخت و نگهداری", icon: AlertCircle, tint: "text-orange-300" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsAdmin({ initialSettings }: { initialSettings: SiteSettingsMap }) {
  const [tab, setTab] = useState<TabId>("login");
  const [form, setForm] = useState(initialSettings);
  const [saved, setSavedSnapshot] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  const set = (key: keyof SiteSettingsMap, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  /* ---------------- پیامک‌ها: ارسال تست و بررسی اعتبار ---------------- */
  const [couponDateDraft, setCouponDateDraft] = useState<Record<number, string>>({});
  const [smsTestPhone, setSmsTestPhone] = useState("");
  const [smsTestBusy, setSmsTestBusy] = useState(false);
  const [smsTestResult, setSmsTestResult] = useState<{
    ok: boolean;
    preview: string;
    error: string;
  } | null>(null);
  const [smsCreditBusy, setSmsCreditBusy] = useState(false);
  const [smsCreditText, setSmsCreditText] = useState("");


  const sendSmsTest = async (
    activity: "otp" | "orderPlaced" | "orderPlacedAdmin" | "orderStatus" | "abandonedFirst" | "abandonedSecond" | "cancelAdmin"
  ) => {
    const phone = smsTestPhone.trim();
    if (!/^09\d{9}$/.test(phone)) {
      setSmsTestResult({
        ok: false,
        preview: "",
        error: "شماره موبایل را به شکل 09xxxxxxxxx وارد کنید.",
      });
      return;
    }
    setSmsTestBusy(true);
    setSmsTestResult(null);
    try {
      // توجه: تست با متن‌های «ذخیره‌شده» ارسال می‌شود؛ اول تغییرات را ذخیره کنید.
      const res = await fetch("/api/admin/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, activity }),
      });
      const data = await res.json();
      setSmsTestResult({
        ok: Boolean(data.ok),
        preview: data.preview || "",
        error: data.error || (res.ok ? "" : "ارسال پیامک تست ناموفق بود."),
      });
    } catch {
      setSmsTestResult({
        ok: false,
        preview: "",
        error: "ارتباط با سرور برقرار نشد.",
      });
    } finally {
      setSmsTestBusy(false);
    }
  };

  const checkSmsCredit = async () => {
    setSmsCreditBusy(true);
    setSmsCreditText("");
    try {
      const res = await fetch("/api/admin/sms/credit");
      const data = await res.json();
      if (data.ok) {
        const value = Number(data.credit) || 0;
        setSmsCreditText(`اعتبار باقیمانده sms.ir: ${value.toLocaleString("fa-IR")}`);
      } else {
        setSmsCreditText(data.error || "دریافت اعتبار ناموفق بود.");
      }
    } catch {
      setSmsCreditText("ارتباط با سرور برقرار نشد.");
    } finally {
      setSmsCreditBusy(false);
    }
  };

  const toggleLoginMethod = (
    key: "loginPhoneEnabled" | "loginEmailEnabled",
  ) => {
    const other =
      key === "loginPhoneEnabled" ? "loginEmailEnabled" : "loginPhoneEnabled";
    const disabling = form[key] === "1";
    if (disabling && form[other] !== "1") {
      setError("حداقل یکی از روش‌های ورود باید فعال بماند.");
      return;
    }
    setError("");
    set(key, disabling ? "" : "1");
  };

  // Compared against the last saved snapshot so each save bar can warn before
  // the admin leaves with unsaved work.
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(saved),
    [form, saved],
  );

  /* ---------------- آیکن بخش‌ها ---------------- */
  const sectionIcons = parseSectionIcons(form.sectionIcons);
  const setSectionIcon = (key: SectionIconKey, name: IconName) =>
    set("sectionIcons", JSON.stringify({ ...sectionIcons, [key]: name }));
  const resetSectionIcons = () => set("sectionIcons", "");

  /* ---------------- کارت‌های مزیت ---------------- */
  const features = parseFeatures(form.homeFeatures);
  const writeFeatures = (list: FeatureCard[]) =>
    set("homeFeatures", JSON.stringify(list));
  const setFeature = (index: number, patch: Partial<FeatureCard>) =>
    writeFeatures(features.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const addFeature = () =>
    writeFeatures([...features, { icon: "sparkles", title: "مزیت تازه", desc: "" }]);
  const removeFeature = (index: number) =>
    writeFeatures(features.filter((_, i) => i !== index));
  const resetFeatures = () => set("homeFeatures", "");

  /* ---------------- نمادهای فوتر ---------------- */
  // The badge list lives in its own state instead of being re-parsed from the
  // form on every render. That parser drops any badge without an image, so a
  // freshly added (still empty) badge vanished the instant it was added and
  // the upload button was unreachable. Drafts are kept here; only badges that
  // actually have an image are written into the form.
  const [badges, setBadges] = useState<FooterBadge[]>(() =>
    parseFooterBadges(initialSettings.footerBadges),
  );
  const writeBadges = (list: FooterBadge[]) => {
    setBadges(list);
    const ready = list.filter((b) => b.image.trim());
    // An empty list is stored as "" so the footer row disappears completely
    // instead of rendering an empty container.
    setForm((f) => ({
      ...f,
      footerBadges: ready.length ? JSON.stringify(ready) : "",
    }));
  };
  const setBadge = (index: number, patch: Partial<FooterBadge>) =>
    writeBadges(badges.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  /* ---------------- دسته‌بندی‌های فروشگاه ---------------- */
  // دقیقاً مثل نمادها، فهرست قابل ویرایش در حالت خام نگه داشته می‌شود؛
  // اگر از پارسر می‌ساختیم، دستهٔ تازهٔ خالی همان لحظه ناپدید می‌شد.
  const [shopCats, setShopCats] = useState<string[]>(() =>
    parseShopCategories(initialSettings.shopCategories),
  );
  const writeShopCats = (list: string[]) => {
    setShopCats(list);
    const ready = list.map((c) => c.trim()).filter(Boolean);
    setForm((f) => ({
      ...f,
      shopCategories: ready.length ? JSON.stringify(ready) : "",
    }));
  };
  const setShopCat = (index: number, value: string) =>
    writeShopCats(shopCats.map((c, i) => (i === index ? value : c)));
  const addShopCat = () => writeShopCats([...shopCats, ""]);
  const removeShopCat = (index: number) =>
    writeShopCats(shopCats.filter((_, i) => i !== index));
  const moveShopCat = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= shopCats.length) return;
    const next = [...shopCats];
    [next[index], next[target]] = [next[target], next[index]];
    writeShopCats(next);
  };

  /* ---------------- شبکه‌های اجتماعی صفحهٔ تماس ---------------- */
  // باز هم درافت خام: پارسر هر ردیف بدون لینک را حذف می‌کند، پس
  // اگر مستقیم از آن می‌خواندیم، کانال تازه قبل از تایپ لینک ناپدید می‌شد.
  const [socials, setSocials] = useState<SocialLink[]>(() =>
    parseSocials(initialSettings.contactSocials),
  );
  const writeSocials = (list: SocialLink[]) => {
    setSocials(list);
    const ready = list.filter((s) => s.name.trim() && s.href.trim());
    // فهرست خالی را عمداً به صورت "[]" ذخیره می‌کنیم و نه "" — چون
    // رشتهٔ خالی یعنی «همان سه کانال پیش‌فرض» و مدیری که همه را پاک کرده
    // دوباره تلگرام و اینستاگرام را می‌دید.
    setForm((f) => ({ ...f, contactSocials: JSON.stringify(ready) }));
  };
  const setSocial = (index: number, patch: Partial<SocialLink>) =>
    writeSocials(socials.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const addSocial = () =>
    // v32: پیش‌فرض ردیف تازه تلگرام است چون گزینهٔ «وب‌سایت» حذف شد.
    writeSocials([...socials, { name: "", href: "", icon: "telegram", color: "" }]);
  const removeSocial = (index: number) =>
    writeSocials(socials.filter((_, i) => i !== index));
  const moveSocial = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= socials.length) return;
    const next = [...socials];
    [next[index], next[target]] = [next[target], next[index]];
    writeSocials(next);
  };
  const resetSocials = () => {
    setSocials(parseSocials(""));
    setForm((f) => ({ ...f, contactSocials: "" }));
  };
  /**
   * دلیل کار نکردن لینک نماد: سرور فقط آدرسی را ذخیره می‌کند که با
   * //:https یا //:http شروع شود. اگر مدیر فقط example.com می‌نوشت، لینک
   * بی‌صدا حذف می‌شد و نماد در فوتر غیرقابل‌کلیک می‌ماند. حالا همینجا
   * درست می‌شود و اگر قابل درست‌شدن نباشد زیر فیلد هشدار نشان می‌دهیم.
   */
  const HTTPS_PREFIX = "http" + "s://";
  const normaliseLink = (raw: string) => {
    const value = raw.trim();
    if (!value) return "";
    if (/^https?:[/][/]/i.test(value)) return value;
    return HTTPS_PREFIX + value.replace(/^[/]+/, "");
  };
  const linkIsUsable = (value: string) =>
    !value.trim() || /^https?:\/\/[^\s]+\.[^\s]{2,}/i.test(value.trim());
  const addBadge = () =>
    writeBadges([...badges, { title: "", image: "", link: "" }]);
  const removeBadge = (index: number) =>
    writeBadges(badges.filter((_, i) => i !== index));
  const moveBadge = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= badges.length) return;
    const list = [...badges];
    [list[index], list[target]] = [list[target], list[index]];
    writeBadges(list);
  };

  /* ---------------- مراحل اسکرول صفحهٔ اصلی ---------------- */
  const stages: JourneyStage[] = parseJourneyStages(
    form.journeyStages,
    DEFAULT_JOURNEY_STAGES,
  );
  const setStage = (index: number, patch: Partial<JourneyStage>) => {
    const next = stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage));
    set("journeyStages", JSON.stringify(next));
  };
  const resetStages = () => set("journeyStages", "");

  /* ---------------- برندهای صفحهٔ اصلی ---------------- */
  const brands: BrandCard[] = parseBrands(form.homeBrands, DEFAULT_BRANDS);
  const writeBrands = (list: BrandCard[]) => set("homeBrands", JSON.stringify(list));
  const setBrand = (index: number, patch: Partial<BrandCard>) =>
    writeBrands(brands.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const addBrand = () =>
    writeBrands([...brands, { en: "", fa: "", country: "", year: "", d: "" }]);
  const removeBrand = (index: number) =>
    writeBrands(brands.filter((_, i) => i !== index));
  const moveBrand = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= brands.length) return;
    const list = [...brands];
    [list[index], list[target]] = [list[target], list[index]];
    writeBrands(list);
  };
  const resetBrands = () => set("homeBrands", "");

  /* ---------------- آپلود تصویر ---------------- */
  const fileRef = useRef<HTMLInputElement>(null);
  const badgeFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Which badge row is waiting for its upload, so only that row spins.
  const [badgeUploading, setBadgeUploading] = useState<number | null>(null);

  // One uploader for every image on this screen. Returns the stored URL, or
  // null when the upload failed (the caller keeps the previous value).
  const uploadImage = async (file: File): Promise<string | null> => {
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "آپلود تصویر ناموفق بود.");
        return null;
      }
      return data.url as string;
    } catch {
      setError("خطا در آپلود تصویر.");
      return null;
    }
  };

  const uploadBottle = async (file: File) => {
    setUploading(true);
    const url = await uploadImage(file);
    if (url) set("journeyBottleImage", url);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const uploadBadge = async (file: File, index: number) => {
    setBadgeUploading(index);
    const url = await uploadImage(file);
    if (url) setBadge(index, { image: url });
    setBadgeUploading(null);
    if (badgeFileRef.current) badgeFileRef.current.value = "";
  };

  /* ---------------- ذخیره ---------------- */
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "خطا در ذخیره تنظیمات.");
        setSaving(false);
        return;
      }
      // The server sanitises some values (badge links, image paths), so adopt
      // what it actually stored rather than assuming our form won.
      const data = await res.json();
      const stored = { ...form, ...(data.settings || {}) } as SiteSettingsMap;
      setForm(stored);
      setSavedSnapshot(stored);
      // Drafts with no image were never sent to the server; drop them so
      // the list on screen matches what the site will actually show.
      setBadges(parseFooterBadges(stored.footerBadges));
      setSavedAt(Date.now());
      setSaving(false);
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
      setSaving(false);
    }
  };

  // Rendered at the end of every tab, so the admin never has to hunt for a
  // save button. Every copy saves the whole form, which is why edits made
  // in another tab are never lost.
  const saveBar = (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-gold/15 glass-soft px-4 py-3">
      <button
        onClick={save}
        disabled={saving || !dirty}
        className="btn-emerald flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-50"
      >
        {savedAt && !dirty && !saving ? <Check size={16} /> : null}
        {saving ? "در حال ذخیره…" : !dirty && savedAt ? "ذخیره شد" : "ذخیره تغییرات"}
      </button>

      {error ? (
        <p className="text-xs font-bold text-red-400">{error}</p>
      ) : dirty ? (
        <p className="text-[11px] font-bold text-amber-300">تغییرات ذخیره‌نشده دارید</p>
      ) : (
        <p className="text-[11px] text-sage/70">همهٔ تغییرات ذخیره شده است.</p>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl pb-12">
      <h1 className="text-xl font-black text-cream">تنظیمات سایت</h1>

      {/* ---------- زبانه‌ها ---------- */}
      <div className="sticky top-0 z-20 -mx-1 mt-5 overflow-x-auto px-1 py-2">
        <div className="flex w-max gap-1.5 rounded-2xl glass-bar p-1.5">
          {TABS.map(({ id, label, icon: Icon, tint }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[12px] font-bold transition-colors ${
                  active
                    ? "glass-soft border border-gold/35 text-cream"
                    : "border border-transparent text-sage hover:text-cream"
                }`}
              >
                <Icon size={14} className={tint} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ================= صفحهٔ اصلی ================= */}
      {tab === "home" && (
        <div className="space-y-4">
          <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
            <div className="flex items-center gap-2 text-gold">
              <Sparkles size={16} />
              <h2 className="text-sm font-black">بنر جشنواره / تخفیف صفحه اصلی</h2>
            </div>
            <p className="mt-1 text-[11px] text-sage">
              این کارت در بالای صفحه‌ی اصلی سایت، زیر لوگو، نمایش داده می‌شود.
            </p>

            <label className="mt-4 flex items-center gap-2 text-xs font-bold text-sage">
              <input
                type="checkbox"
                checked={form.festivalActive === "true"}
                onChange={(e) => set("festivalActive", e.target.checked ? "true" : "false")}
                className="h-4 w-4 accent-[#d4af7c]"
              />
              نمایش بنر جشنواره در صفحه اصلی
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-sage">عنوان</label>
                <input
                  value={form.festivalTitle}
                  onChange={(e) => set("festivalTitle", e.target.value)}
                  className={inputCls}
                  placeholder="جشنواره خرید اول بلا"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-sage">توضیح کوتاه</label>
                <input
                  value={form.festivalSubtitle}
                  onChange={(e) => set("festivalSubtitle", e.target.value)}
                  className={inputCls}
                  placeholder="۲۵٪ تخفیف + اتومایزر هدیه"
                />
              </div>
            </div>
          </section>

          {/* ---------- کارت تخفیف‌ها (باکس دوم، جدا از جشنواره) ---------- */}
          <section className="gold-ring rounded-2xl glass-panel p-5">
            <div className="flex items-center gap-2 text-emerald-300">
              <BadgePercent size={16} />
              <h2 className="text-sm font-black">کارت تخفیف‌ها (باکس دوم صفحهٔ اصلی)</h2>
            </div>
            <p className="mt-1 text-[11px] leading-6 text-sage">
              کارتی جدا از بنر جشنواره؛ با کلیک روی آن، فروشگاه فقط ادکلن‌های مشمول تخفیف را
              نشان می‌دهد (محصولاتی که «قیمت قبلی» دارند).
            </p>

            <label className="mt-4 flex items-center gap-2 text-xs font-bold text-sage">
              <input
                type="checkbox"
                checked={form.discountsBoxActive === "1"}
                onChange={(e) => set("discountsBoxActive", e.target.checked ? "1" : "")}
                className="h-4 w-4 accent-[#d4af7c]"
              />
              نمایش کارت تخفیف‌ها در صفحهٔ اصلی
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-sage">عنوان</label>
                <input
                  value={form.discountsBoxTitle}
                  onChange={(e) => set("discountsBoxTitle", e.target.value)}
                  className={inputCls}
                  placeholder="تخفیف‌های بلا"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-sage">توضیح کوتاه</label>
                <input
                  value={form.discountsBoxSubtitle}
                  onChange={(e) => set("discountsBoxSubtitle", e.target.value)}
                  className={inputCls}
                  placeholder="ادکلن‌های مشمول تخفیف را ببینید"
                />
              </div>
            </div>
          </section>

          {/* ---------- تخفیف خرید اول + باکس VIP ---------- */}
          <section className="gold-ring rounded-2xl glass-panel p-5">
            <div className="flex items-center gap-2 text-gold">
              <Sparkles size={16} />
              <h2 className="text-sm font-black">تخفیف خرید اول و باکس VIP</h2>
            </div>

            <label className="mt-4 flex items-center gap-2 text-xs font-bold text-sage">
              <input
                type="checkbox"
                checked={form.firstPurchaseDiscountEnabled === "1"}
                onChange={(e) => set("firstPurchaseDiscountEnabled", e.target.checked ? "1" : "")}
                className="h-4 w-4 accent-[#d4af7c]"
              />
              فعال‌بودن تخفیف خرید اول مشتری
            </label>
            <p className="mt-1 text-[10.5px] leading-5 text-sage/70">
              فقط برای مشتری‌هایی که تا امروز هیچ سفارشی نداشته‌اند؛ روی جمع سبد (بدون کرایه)
              اعمال می‌شود.
            </p>
            <div className="mt-3 max-w-xs">
              <label className="mb-1 block text-[11px] font-bold text-sage">درصد تخفیف (۰ تا ۹۰)</label>
              <input
                type="number"
                min={0}
                max={90}
                value={form.firstPurchasePercent}
                onChange={(e) => set("firstPurchasePercent", e.target.value)}
                className={inputCls}
                placeholder="25"
              />
            </div>

            <div className="mt-6 border-t border-gold/10 pt-5">
              <label className="flex items-center gap-2 text-xs font-bold text-sage">
                <input
                  type="checkbox"
                  checked={form.vipBoxEnabled === "1"}
                  onChange={(e) => set("vipBoxEnabled", e.target.checked ? "1" : "")}
                  className="h-4 w-4 accent-[#d4af7c]"
                />
                فعال‌بودن باکس ویژه (VIP) هنگام خرید
              </label>
              <p className="mt-1 text-[10.5px] leading-5 text-sage/70">
                با فعال‌بودن، مشتری هنگام خرید می‌تواند انتخاب کند که ادکلن داخل باکس لوکس ارسال شود.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-sage">هزینهٔ باکس (تومان)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.vipBoxFee}
                    onChange={(e) => set("vipBoxFee", e.target.value)}
                    className={inputCls}
                    placeholder="150000"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-sage">عنوان باکس</label>
                  <input
                    value={form.vipBoxTitle}
                    onChange={(e) => set("vipBoxTitle", e.target.value)}
                    className={inputCls}
                    placeholder="باکس ویژه VIP"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-[11px] font-bold text-sage">توضیح باکس (به مشتری)</label>
                <input
                  value={form.vipBoxDesc}
                  onChange={(e) => set("vipBoxDesc", e.target.value)}
                  className={inputCls}
                  placeholder="ادکلن شما داخل باکس لوکس و مخملی، با روبان طلایی ارسال می‌شود."
                />
              </div>
            </div>
          </section>

          {/* ---------- کدهای تخفیف (v40) ---------- */}
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
              هر کد می‌تواند درصدی (۱ تا ۹۰٪) یا مبلغی (تومان) باشد و تا پایان «تاریخ
              انقضای شمسی» معتبر است؛ خالی‌گذاشتن تاریخ یعنی بدون انقضا. کد تخفیف و
              تخفیف خرید اول روی هم جمع نمی‌شوند — هرکدام که مبلغش بیشتر باشد اعمال
              می‌شود. مبلغ تخفیف در فاکتور مشتری، «مدیریت سفارش‌ها» و «فاکتورها» نمایش
              داده می‌شود. <b>هر کد به‌ازای هر اکانت فقط یک بار</b> قابل استفاده است و
              <b> فقط با پرداخت شدنِ سفارش می‌سوزد</b>؛ سفارشِ پرداخت‌نشده پس از انقضا یا لغو،
              کد را آزاد می‌کند (تا انقضا، کد روی همان سفارش قفل است و سفارشِ دوم با آن گرفته نمی‌شود).
            </p>

            {(() => {
              type CRow = { code?: string; percent?: number; amount?: number; until?: string };
              let list: CRow[] = [];
              try {
                const parsed = JSON.parse(form.couponCodesJson || "[]");
                if (Array.isArray(parsed)) list = parsed;
              } catch {
                /* داده قدیمی/خراب — با اولین ویرایش سالم بازنویسی می‌شود */
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
                      <div
                        key={i}
                        className="mt-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_96px_104px_150px_42px]"
                      >
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
                          <span className="mb-1 block text-[10.5px] font-bold text-sage">
                            تاریخ انقضا (شمسی)
                          </span>
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
                          className="rounded-lg border border-red-400/30 p-2.5 text-[#8c2f3f] transition hover:bg-red-400/10"
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
          </section>

          {/* ---------- متن مراحل صفحه اصلی ---------- */}
          <section className="gold-ring rounded-2xl glass-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-gold">
                <ScrollText size={16} />
                <h2 className="text-sm font-black">متن مراحل انیمیشن صفحه اصلی</h2>
              </div>
              <button
                type="button"
                onClick={resetStages}
                className="btn-ghost rounded-full px-3.5 py-1.5 text-[11px] font-bold"
              >
                بازگرداندن به متن پیش‌فرض
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-6 text-sage">
              همان متن‌هایی که همراه انیمیشن بطری عطر با اسکرول ظاهر می‌شوند.
            </p>

            <div className="mt-4 space-y-3">
              {stages.map((stage, index) => (
                <div key={index} className="rounded-xl border border-gold/15 glass-soft p-3.5">
                  <p className="mb-2 text-[10.5px] font-bold text-gold-soft">مرحله {index + 1}</p>
                  <input
                    value={stage.t}
                    onChange={(e) => setStage(index, { t: e.target.value })}
                    placeholder="عنوان مرحله"
                    className={inputCls}
                  />
                  <textarea
                    rows={2}
                    value={stage.d}
                    onChange={(e) => setStage(index, { d: e.target.value })}
                    placeholder="توضیح مرحله"
                    className={`${inputCls} mt-2`}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-sage">
                  رنگ شیشه بطری صفحه اصلی
                </label>
                <input
                  type="color"
                  value={form.journeyBottleGlass}
                  onChange={(e) => set("journeyBottleGlass", e.target.value)}
                  className="h-10 w-full rounded-lg border border-gold/25 bg-transparent text-[#241a22]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-sage">
                  رنگ مایع عطر صفحه اصلی
                </label>
                <input
                  type="color"
                  value={form.journeyBottleLiquid}
                  onChange={(e) => set("journeyBottleLiquid", e.target.value)}
                  className="h-10 w-full rounded-lg border border-gold/25 bg-transparent text-[#241a22]"
                />
              </div>
            </div>
          </section>

          {/* ---------- تصویر عطر صفحه اصلی ---------- */}
          <section className="gold-ring rounded-2xl glass-panel p-4 sm:p-5">
            <div className="flex items-center gap-2 text-gold">
              <ImagePlus size={16} />
              <h2 className="text-sm font-black">تصویر عطر صفحه اصلی</h2>
            </div>
            <p className="mt-1 text-[11px] leading-6 text-sage">
              اگر تصویری آپلود کردید، جای بطری طراحی‌شده در انیمیشن اسکرول صفحه اصلی
              نمایش داده می‌شود. تصویر PNG با پس‌زمینه شفاف بهترین نتیجه را می‌دهد.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-xl glass-panel">
                {form.journeyBottleImage ? (
                  <Image
                    src={form.journeyBottleImage}
                    alt="تصویر عطر صفحه اصلی"
                    fill
                    sizes="96px"
                    className="object-contain"
                    unoptimized
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-sage">
                    پیش‌فرض (بطری طراحی‌شده)
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadBottle(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="btn-ghost flex items-center gap-1.5 rounded-full px-4 py-2 text-[11.5px] font-bold disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                  {uploading ? "در حال آپلود…" : "انتخاب تصویر"}
                </button>
                {form.journeyBottleImage && (
                  <button
                    type="button"
                    onClick={() => set("journeyBottleImage", "")}
                    className="flex items-center gap-1.5 rounded-full border border-red-400/30 px-4 py-2 text-[11.5px] font-bold text-red-300 hover:bg-red-400/10"
                  >
                    <Trash2 size={13} /> حذف تصویر
                  </button>
                )}
              </div>
            </div>
          </section>
          {saveBar}
        </div>
      )}

      {/* ================= برندها ================= */}
      {tab === "brands" && (
        <section className="gold-ring mt-2 rounded-2xl glass-panel p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-gold">
              <Tag size={16} />
              <h2 className="text-sm font-black">برندهای صفحه اصلی</h2>
              <span className="rounded-full border border-gold/20 px-2 py-0.5 text-[10px] text-sage">
                {brands.length.toLocaleString("fa-IR")} کارت
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addBrand}
                className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
              >
                <Plus size={13} /> افزودن برند
              </button>
              <button
                type="button"
                onClick={resetBrands}
                title="بازگرداندن به لیست پیش‌فرض"
                className="btn-ghost rounded-full p-2"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
          <p className="mt-1 text-[11px] leading-6 text-sage">
            همین کارت‌ها در بخش «برندهای مطرح دنیا در بلا» نمایش داده می‌شوند.
          </p>

          <div className="mt-4 space-y-3">
            {brands.map((brand, index) => (
              <div key={index} className="rounded-xl border border-gold/15 glass-soft p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-gold-soft">
                    <GripVertical size={12} /> کارت {(index + 1).toLocaleString("fa-IR")}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveBrand(index, -1)}
                      disabled={index === 0}
                      className="rounded-lg border border-gold/20 px-2 py-1 text-[11px] text-sage disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBrand(index, 1)}
                      disabled={index === brands.length - 1}
                      className="rounded-lg border border-gold/20 px-2 py-1 text-[11px] text-sage disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBrand(index)}
                      className="rounded-lg border border-red-400/30 p-1.5 text-red-300 hover:bg-red-400/10"
                      title="حذف برند"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={brand.en}
                    onChange={(e) => setBrand(index, { en: e.target.value })}
                    placeholder="نام لاتین (Chanel)"
                    dir="ltr"
                    className={inputCls}
                  />
                  <input
                    value={brand.fa}
                    onChange={(e) => setBrand(index, { fa: e.target.value })}
                    placeholder="نام فارسی (شنل)"
                    className={inputCls}
                  />
                  <input
                    value={brand.country}
                    onChange={(e) => setBrand(index, { country: e.target.value })}
                    placeholder="کشور (فرانسه)"
                    className={inputCls}
                  />
                  <input
                    value={brand.year}
                    onChange={(e) => setBrand(index, { year: e.target.value })}
                    placeholder="سال تأسیس (۱۹۱۰)"
                    className={inputCls}
                  />
                </div>
                <textarea
                  rows={2}
                  value={brand.d}
                  onChange={(e) => setBrand(index, { d: e.target.value })}
                  placeholder="توضیح کوتاه برند"
                  className={`${inputCls} mt-2`}
                />
              </div>
            ))}

            {brands.length === 0 && (
              <p className="rounded-xl border border-dashed border-gold/20 px-4 py-6 text-center text-[11px] text-sage">
                هنوز برندی ثبت نشده است. بخش برندها در صفحه اصلی خالی می‌ماند.
              </p>
            )}
          </div>
          {saveBar}
        </section>
      )}

      {/* ================= آیکن‌ها و مزیت‌ها ================= */}
      {tab === "icons" && (
        <div className="space-y-4">
          <section className="gold-ring mt-2 rounded-2xl glass-panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-gold">
              <div className="flex items-center gap-2">
                <Sparkles size={16} />
                <h2 className="text-sm font-black">آیکن بخش‌های سایت</h2>
              </div>
              <button
                type="button"
                onClick={resetSectionIcons}
                className="flex items-center gap-1 text-[11px] font-bold text-sage hover:text-gold"
              >
                <RotateCcw size={12} /> بازگردانی به پیش‌فرض
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-6 text-sage">
              همهٔ آیکن‌ها فایل‌های SVG درون پوشهٔ{" "}
              <span className="text-gold">web/public/icons</span> هستند؛ هیچ وابستگی به سایت
              دیگری ندارند. برای افزودن آیکن تازه، فایل SVG را در همان پوشه بگذارید و
              نامش را به فهرست <span className="text-gold">lib/icons.ts</span> اضافه کنید.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SECTION_ICON_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-3 rounded-xl glass-soft p-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold/35 bg-gold/10">
                    <SiteIcon name={sectionIcons[key]} size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-black text-cream">
                      {SECTION_ICON_LABELS[key]}
                    </p>
                    <select
                      value={sectionIcons[key]}
                      onChange={(e) => setSectionIcon(key, e.target.value as IconName)}
                      className={`${inputCls} mt-1.5 py-2 text-[12px]`}
                    >
                      {ICON_NAMES.map((name) => (
                        <option key={name} value={name} className="bg-night">
                          {ICON_LABELS[name]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- مزیت‌های فروشگاه ---------- */}
          <section className="gold-ring rounded-2xl glass-panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-gold">
              <div className="flex items-center gap-2">
                <Tag size={16} />
                <h2 className="text-sm font-black">مزیت‌های فروشگاه (صفحهٔ اصلی)</h2>
              </div>
              <button
                type="button"
                onClick={resetFeatures}
                className="flex items-center gap-1 text-[11px] font-bold text-sage hover:text-gold"
              >
                <RotateCcw size={12} /> بازگردانی به پیش‌فرض
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-6 text-sage">
              کارت‌های اعتمادساز بالای صفحهٔ اصلی؛ هر کارت یک آیکن، یک عنوان و یک
              توضیح کوتاه دارد.
            </p>

            <div className="mt-4 space-y-3">
              {features.map((card, i) => (
                <div key={i} className="rounded-xl glass-soft p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold/35 bg-gold/10">
                      <SiteIcon name={card.icon} size={20} />
                    </span>
                    <select
                      value={card.icon}
                      onChange={(e) => setFeature(i, { icon: e.target.value as IconName })}
                      className={`${inputCls} py-2 text-[12px] sm:max-w-44`}
                    >
                      {ICON_NAMES.map((name) => (
                        <option key={name} value={name} className="bg-night">
                          {ICON_LABELS[name]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeFeature(i)}
                      className="ms-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-400/30 text-red-300 hover:bg-red-400/10"
                      aria-label="حذف کارت"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    value={card.title}
                    onChange={(e) => setFeature(i, { title: e.target.value })}
                    placeholder="عنوان مزیت"
                    className={`${inputCls} mt-2`}
                  />
                  <textarea
                    value={card.desc}
                    onChange={(e) => setFeature(i, { desc: e.target.value })}
                    rows={2}
                    placeholder="توضیح کوتاه"
                    className={`${inputCls} mt-2`}
                  />
                </div>
              ))}
            </div>

            {features.length < 12 && (
              <button
                type="button"
                onClick={addFeature}
                className="btn-ghost mt-3 flex items-center gap-1.5 rounded-full px-4 py-2 text-[11.5px] font-bold"
              >
                <Plus size={13} /> افزودن کارت
              </button>
            )}
          </section>
          {saveBar}
        </div>
      )}

      {/* ================= فوتر و نمادها ================= */}
      {tab === "footer" && (
        <div className="space-y-4">
          <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
            <div className="flex items-center gap-2 text-gold">
              <PenLine size={16} />
              <h2 className="text-sm font-black">متن درباره‌ی ما (فوتر سایت)</h2>
            </div>
            <p className="mt-1 text-[11px] text-sage">
              این پاراگراف زیر لوگوی پایین سایت، در فوتر همه‌ی صفحات نمایش داده می‌شود.
            </p>
            <textarea
              rows={4}
              value={form.footerAbout}
              onChange={(e) => set("footerAbout", e.target.value)}
              className={`${inputCls} mt-4`}
            />
          </section>

          {/* ---------- نماد اعتماد و سایر نمادها ---------- */}
          <section className="gold-ring rounded-2xl glass-panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-gold">
                <BadgeCheck size={16} />
                <h2 className="text-sm font-black">نماد اعتماد و سایر نمادها</h2>
                <span className="rounded-full border border-gold/20 px-2 py-0.5 text-[10px] text-sage">
                  {badges.length.toLocaleString("fa-IR")} از ۸
                </span>
              </div>
              {badges.length < 8 && (
                <button
                  type="button"
                  onClick={addBadge}
                  className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
                >
                  <Plus size={13} /> افزودن نماد
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-6 text-sage">
              نماد اعتماد الکترونیکی، ساماندهی، اتحادیه کسب‌وکارهای مجازی یا هر نشان دیگری
              که دارید. تصویر را آپلود کنید و لینک استعلام را بگذارید؛ همین ترتیب در فوتر
              نمایش داده می‌شود. اگر هیچ نمادی ثبت نکنید، این بخش از فوتر حذف می‌شود.
            </p>

            <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-3 text-[10.5px] leading-6 text-sky-100/80">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-sky-300" />
              <span>
                نماد اعتماد یک قطعه کد هم می‌دهد، اما اجرای کد بیرونی در همهٔ صفحات ریسک
                امنیتی دارد. روش امن همین است: تصویر نماد را ذخیره کنید و لینک رسمی
                استعلام را روی آن بگذارید — کاربر با کلیک روی نماد به صفحهٔ استعلام
                می‌رود و اعتبار همان است.
              </span>
            </div>

            <input
              ref={badgeFileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                const index = Number(e.target.dataset.index ?? "-1");
                if (file && index >= 0) uploadBadge(file, index);
              }}
            />

            <div className="mt-4 space-y-3">
              {badges.map((badge, index) => (
                <div key={index} className="rounded-xl border border-gold/15 glass-soft p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-gold-soft">
                      <GripVertical size={12} /> نماد {(index + 1).toLocaleString("fa-IR")}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveBadge(index, -1)}
                        disabled={index === 0}
                        className="rounded-lg border border-gold/20 px-2 py-1 text-[11px] text-sage disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBadge(index, 1)}
                        disabled={index === badges.length - 1}
                        className="rounded-lg border border-gold/20 px-2 py-1 text-[11px] text-sage disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBadge(index)}
                        className="rounded-lg border border-red-400/30 p-1.5 text-red-300 hover:bg-red-400/10"
                        title="حذف نماد"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-start gap-3">
                    {/* Preview on white, exactly like the footer renders it: most
                        Iranian badge images are dark artwork on transparency. */}
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white/90">
                      {badge.image ? (
                        <Image
                          src={badge.image}
                          alt={badge.title || "نماد"}
                          fill
                          sizes="80px"
                          className="object-contain p-1.5"
                          unoptimized
                          referrerPolicy="origin"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-[9px] text-night/60">
                          بدون تصویر
                        </span>
                      )}
                    </div>

                    <div className="min-w-[200px] flex-1 space-y-2">
                      <input
                        value={badge.title}
                        onChange={(e) => setBadge(index, { title: e.target.value })}
                        placeholder="عنوان نماد (مثلاً نماد اعتماد الکترونیکی)"
                        className={inputCls}
                      />
                      <input
                        value={badge.link}
                        onChange={(e) => {
                          // کد کامل اینماد (یا لینکش) چسبانده شد: لینک و لوگوی
                          // زنده خودکار پر می‌شود و آپلود تصویر لازم نیست.
                          const seal = parseEnamadSeal(e.target.value);
                          if (seal) {
                            setBadge(index, {
                              link: seal.link,
                              image: seal.image,
                              title: badge.title || "نماد اعتماد الکترونیکی",
                            });
                          } else {
                            setBadge(index, { link: e.target.value });
                          }
                        }}
                        onBlur={(e) =>
                          setBadge(index, { link: normaliseLink(e.target.value) })
                        }
                        placeholder="لینک استعلام یا کد کامل اینماد را این‌جا بچسبانید"
                        dir="ltr"
                        aria-invalid={!linkIsUsable(badge.link)}
                        className={inputCls}
                      />
                      {!linkIsUsable(badge.link) && (
                        <p className="form-hint form-hint-error">
                          این آدرس معتبر نیست و ذخیره نخواهد شد. نشانی کامل صفحهٔ استعلام را بگذارید.
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!badgeFileRef.current) return;
                            badgeFileRef.current.dataset.index = String(index);
                            badgeFileRef.current.click();
                          }}
                          disabled={badgeUploading !== null}
                          className="btn-ghost flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold disabled:opacity-60"
                        >
                          {badgeUploading === index ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <ImagePlus size={12} />
                          )}
                          {badgeUploading === index
                            ? "در حال آپلود…"
                            : badge.image
                              ? "تعویض تصویر"
                              : "آپلود تصویر نماد"}
                        </button>
                        {badge.link && (
                          <a
                            href={badge.link}
                            target="_blank"
                            rel="noopener"
                            referrerPolicy="origin"
                            className="flex items-center gap-1 text-[11px] font-bold text-sky-300 hover:underline"
                          >
                            <ExternalLink size={12} /> باز کردن لینک
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {badges.length === 0 && (
                <p className="rounded-xl border border-dashed border-gold/20 px-4 py-6 text-center text-[11px] leading-6 text-sage">
                  هنوز نمادی ثبت نشده است.
                  <br />
                  با دکمهٔ «افزودن نماد» اولین نماد را بسازید.
                </p>
              )}
            </div>
          </section>
          {saveBar}
        </div>
      )}

      {/* ================= باشگاه مشتریان ================= */}
      {tab === "loyalty" && (
        <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-gold">
            <Gem size={16} />
            <h2 className="text-sm font-black">باشگاه مشتریان (امتیاز و سطح عضویت)</h2>
          </div>
          <p className="mt-1 text-[11px] leading-6 text-sage">
            امتیاز هر مشتری از جمع خریدهای پرداخت‌شده محاسبه می‌شود و با تغییر این
            اعداد، سطح عضویت همه مشتریان بلافاصله به‌روز می‌شود.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-sage">
                تومان به ازای یک امتیاز
              </label>
              <input
                type="number"
                min={1}
                value={form.tomanPerPoint}
                onChange={(e) => set("tomanPerPoint", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-sage">
                آستانه عضویت طلایی (تومان)
              </label>
              <input
                type="number"
                min={0}
                value={form.tierGoldSpend}
                onChange={(e) => set("tierGoldSpend", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-sage">
                آستانه عضویت الماسی (تومان)
              </label>
              <input
                type="number"
                min={0}
                value={form.tierDiamondSpend}
                onChange={(e) => set("tierDiamondSpend", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          {saveBar}
        </section>
      )}

      {/* ================= ارسال ================= */}
      {tab === "shipping" && (
        <div className="space-y-4">
          <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
            <div className="flex items-center gap-2 text-gold">
              <Truck size={16} />
              <h2 className="text-sm font-black">تنظیمات ارسال سفارش</h2>
            </div>
            <p className="mt-1 text-[11px] leading-6 text-sage">
              هزینه و رایگان‌شدن ارسال همیشه در سرور محاسبه می‌شود و مشتری نمی‌تواند
              مبلغ آن را تغییر دهد.
            </p>

            <div className="mt-4 max-w-xl">
              <label className="block rounded-2xl border border-gold/15 p-4">
                <span className="mb-1.5 block text-[11px] font-bold text-gold-soft">
                  حداقل مبلغ سبد برای ارسال رایگان (تومان)
                </span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={form.shippingFreeThreshold}
                  onChange={(event) => set("shippingFreeThreshold", event.target.value)}
                  className={inputCls}
                />
                <span className="mt-1.5 block text-[10px] leading-5 text-sage/70">
                  عدد صفر یعنی تمام روش‌های واجدشرایط از هر مبلغی رایگان باشند.
                </span>
              </label>
            </div>
          </section>

          {/* ================= روش‌های ارسال فعال ================= */}
          {(() => {
            const shipMethods: {
              key: keyof SiteSettingsMap;
              label: string;
              desc: string;
            }[] = [
              { key: "shippingTipaxEnabled", label: "تیپاکس", desc: "تحویل درب منزل با بارکد رهگیری، سراسری" },
              { key: "shippingPishtazEnabled", label: "پست پیشتاز", desc: "پست جمهوری اسلامی ایران، سراسری" },
              { key: "shippingChaparEnabled", label: "چاپار اکسپرس", desc: "ارسال سریع بین‌شهری، سراسری" },
              { key: "shippingPeykEnabled", label: "پیک محلی", desc: "فقط برای مقصدهای استان البرز" },
            ];
            const enabledCount = shipMethods.filter((m) => form[m.key] !== "").length;
            const onlyPeyk = enabledCount === 1 && form.shippingPeykEnabled !== "";
            return (
              <section className="gold-ring rounded-2xl glass-panel p-5">
                <div className="flex items-center gap-2 text-gold">
                  <Truck size={16} />
                  <h2 className="text-sm font-black">روش‌های ارسال قابل انتخاب برای مشتری</h2>
                </div>
                <p className="mt-1 text-[11px] leading-6 text-sage">
                  هر روشی که تیک داشته باشد در مرحلهٔ پرداخت به مشتری نشان داده می‌شود؛ مثلاً فقط
                  «تیپاکس»، یا «تیپاکس» و «پست پیشتاز» با هم. حداقل یک روش باید فعال بماند.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {shipMethods.map((m) => {
                    const on = form[m.key] !== "";
                    const isLastOn = on && enabledCount === 1;
                    return (
                      <label
                        key={m.key}
                        className={`flex items-start gap-3 rounded-2xl border p-4 transition select-none ${
                          on ? "border-gold/50 bg-gold/10" : "border-gold/15 bg-gold/[0.02] opacity-70"
                        } ${isLastOn ? "cursor-not-allowed" : "cursor-pointer"}`}
                        title={isLastOn ? "حداقل یک روش ارسال باید فعال باشد" : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={isLastOn}
                          onChange={(e) => set(m.key, e.target.checked ? "1" : "")}
                          className="mt-0.5 h-4 w-4 accent-[#d4af7c]"
                        />
                        <span className="flex-1">
                          <span className="block text-xs font-bold text-cream">{m.label}</span>
                          <span className="mt-0.5 block text-[10.5px] leading-5 text-sage/80">{m.desc}</span>
                          <span className={`mt-1 block text-[10px] font-bold ${on ? "text-emerald-300" : "text-sage/60"}`}>
                            {on ? "✓ به مشتری نمایش داده می‌شود" : "✕ مخفی"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {onlyPeyk && (
                  <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[11px] leading-5 text-amber-200">
                    ⚠ فقط «پیک محلی» فعال است و پیک فقط به استان البرز ارسال می‌کند؛ مشتریان سایر استان‌ها
                    هیچ روش ارسالی نخواهند دید و نمی‌توانند سفارش ثبت کنند.
                  </p>
                )}
              </section>
            );
          })()}

          {/* ================= زمان تحویل محصول به مشتری ================= */}
          <section className="gold-ring rounded-2xl glass-panel p-5">
            <div className="flex items-center gap-2 text-gold">
              <Clock size={16} />
              <h2 className="text-sm font-black">تنظیمات تاریخ و زمان تحویل محصول به مشتری</h2>
            </div>
            <p className="mt-1 text-[11px] leading-6 text-sage">
              مدیریت نمایش مدت زمان تحویل به خریدار در مرحلهٔ پرداخت و امکان تعیین تعداد روز تحویل برای هر روش پستی (پست معمولی، تیپاکس و...).
            </p>

            {/* کلید روشن / خاموش نمایش زمان تحویل */}
            <div className="mt-4 rounded-2xl border border-gold/15 bg-gold/[0.03] p-4">
              <label className="flex items-center gap-3 text-xs font-bold text-cream cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.deliveryEstimateEnabled !== ""}
                  onChange={(e) => set("deliveryEstimateEnabled", e.target.checked ? "1" : "")}
                  className="h-4 w-4 accent-[#d4af7c]"
                />
                <span>نمایش زمان تحویل به مشتری در مرحله خرید</span>
              </label>
              <p className="mt-1.5 text-[10.5px] leading-5 text-sage/80">
                {form.deliveryEstimateEnabled !== ""
                  ? "✓ فعال — زمان تحویل هر روش پستی در سبد خرید، فاکتور و حساب کاربری به خریدار نمایش داده می‌شود."
                  : "✕ غیرفعال — زمان تحویل به مشتری نشان داده نمی‌شود و کاملاً مخفی خواهد بود."}
              </p>
            </div>

            {/* فیلدهای روز تحویل هر روش ارسال */}
            <div className="mt-5 space-y-3">
              <h3 className="text-xs font-bold text-gold-soft">
                تعداد روز تحویل به تفکیک روش‌های پستی (روز کاری):
              </h3>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <label className="block rounded-2xl border border-gold/15 bg-gold/[0.02] p-4">
                  <span className="mb-1 block text-[11.5px] font-bold text-cream">
                    پست معمولی / پیشتاز
                  </span>
                  <input
                    type="text"
                    value={form.deliveryDaysPishtaz}
                    onChange={(e) => set("deliveryDaysPishtaz", e.target.value)}
                    className={inputCls}
                    placeholder="7 یا 5 تا 7"
                  />
                  <span className="mt-1.5 block text-[10px] text-sage/70">
                    پیش‌فرض: ۷ روز کاری (مثلاً: 7 یا 5 تا 7)
                  </span>
                </label>

                <label className="block rounded-2xl border border-gold/15 bg-gold/[0.02] p-4">
                  <span className="mb-1 block text-[11.5px] font-bold text-cream">
                    تیپاکس
                  </span>
                  <input
                    type="text"
                    value={form.deliveryDaysTipax}
                    onChange={(e) => set("deliveryDaysTipax", e.target.value)}
                    className={inputCls}
                    placeholder="2 یا 1 تا 2"
                  />
                  <span className="mt-1.5 block text-[10px] text-sage/70">
                    پیش‌فرض: ۲ روز کاری (مثلاً: 2 یا 1 تا 2)
                  </span>
                </label>

                <label className="block rounded-2xl border border-gold/15 bg-gold/[0.02] p-4">
                  <span className="mb-1 block text-[11.5px] font-bold text-cream">
                    چاپار اکسپرس
                  </span>
                  <input
                    type="text"
                    value={form.deliveryDaysChapar}
                    onChange={(e) => set("deliveryDaysChapar", e.target.value)}
                    className={inputCls}
                    placeholder="2 یا 1 تا 2"
                  />
                  <span className="mt-1.5 block text-[10px] text-sage/70">
                    پیش‌فرض: ۲ روز کاری
                  </span>
                </label>

                <label className="block rounded-2xl border border-gold/15 bg-gold/[0.02] p-4">
                  <span className="mb-1 block text-[11.5px] font-bold text-cream">
                    پیک محلی
                  </span>
                  <input
                    type="text"
                    value={form.deliveryDaysPeyk}
                    onChange={(e) => set("deliveryDaysPeyk", e.target.value)}
                    className={inputCls}
                    placeholder="1"
                  />
                  <span className="mt-1.5 block text-[10px] text-sage/70">
                    پیش‌فرض: ۱ روز کاری
                  </span>
                </label>
              </div>
            </div>

            {/* پیش‌نمایش نحوه مشاهده توسط مشتری */}
            <div className="mt-4 rounded-xl border border-gold/30 bg-black/80 p-3.5">
              <span className="text-[10.5px] font-bold text-gold">پیش‌نمایش در مرحلهٔ انتخاب روش ارسال:</span>
              {form.deliveryEstimateEnabled === "" ? (
                <p className="mt-1 text-[11px] text-sage">
                  نمایش زمان تحویل غیرفعال است؛ فقط عنوان روش ارسال و توضیحات مختصر آن به مشتری نمایش داده می‌شود.
                </p>
              ) : (
                <div className="mt-2 space-y-1.5 text-[11px] text-cream">
                  {form.shippingTipaxEnabled !== "" && (
                    <p>• <span className="font-bold text-gold-soft">تیپاکس:</span> تحویل {form.deliveryDaysTipax || "۲"} روز کاری</p>
                  )}
                  {form.shippingPishtazEnabled !== "" && (
                    <p>• <span className="font-bold text-gold-soft">پست پیشتاز:</span> تحویل {form.deliveryDaysPishtaz || "۷"} روز کاری</p>
                  )}
                  {form.shippingChaparEnabled !== "" && (
                    <p>• <span className="font-bold text-gold-soft">چاپار اکسپرس:</span> تحویل {form.deliveryDaysChapar || "۲"} روز کاری</p>
                  )}
                  {form.shippingPeykEnabled !== "" && (
                    <p>• <span className="font-bold text-gold-soft">پیک محلی:</span> تحویل {form.deliveryDaysPeyk || "۱"} روز کاری</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {saveBar}
        </div>
      )}

      {/* ================= دسته‌بندی فروشگاه ================= */}
      {tab === "categories" && (
        <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-gold">
            <LayoutGrid size={16} />
            <h2 className="text-sm font-black">دسته‌بندی‌های صفحهٔ فروشگاه</h2>
          </div>
          <p className="mt-1.5 text-[11px] leading-6 text-sage">
            این نام‌ها همان دکمه‌های بالای صفحهٔ فروشگاه‌اند و باید دقیقاً با
            «دسته‌بندی» ثبت‌شده در محصولات یکی باشند؛ وگرنه آن دکمه نتیجه‌ای
            نشان نمی‌دهد. دکمهٔ «همه» خودکار اضافه می‌شود.
          </p>

          <div className="mt-4 space-y-2">
            {shopCats.length === 0 && (
              <p className="rounded-xl glass-soft p-4 text-center text-[11px] text-sage">
                فهرست خالی است — در این حالت سه دستهٔ پیش‌فرض (زنانه، مردانه،
                یونیسکس) نمایش داده می‌شود.
              </p>
            )}
            {shopCats.map((cat, i) => (
              <div key={i} className="flex items-center gap-2">
                <GripVertical size={14} className="shrink-0 text-sage/50" />
                <input
                  value={cat}
                  onChange={(e) => setShopCat(i, e.target.value)}
                  placeholder="مثلاً: اودی پارفوم"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => moveShopCat(i, -1)}
                  className="rounded-lg border border-gold/25 p-2 text-gold-soft hover:bg-gold/10"
                  aria-label="بالا"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveShopCat(i, 1)}
                  className="rounded-lg border border-gold/25 p-2 text-gold-soft hover:bg-gold/10"
                  aria-label="پایین"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeShopCat(i)}
                  className="rounded-lg border border-rose-400/30 p-2 text-rose-300 hover:bg-rose-400/10"
                  aria-label="حذف"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addShopCat}
            className="btn-sky mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold"
          >
            <Plus size={14} /> دستهٔ جدید
          </button>

          {saveBar}
        </section>
      )}

      {tab === "contact" && (
        <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-gold">
            <Share2 size={16} />
            <h2 className="text-sm font-black">صفحهٔ تماس با ما</h2>
          </div>
          <p className="mt-1.5 text-[11px] leading-6 text-sage">
            متن بالای شبکه‌های اجتماعی، خود کانال‌ها و سه کارت تماس
            همگی از همینجا قابل تغییرند.
          </p>

          <label className="mt-4 block">
            <span className="form-label">متن بالای شبکه‌های اجتماعی</span>
            <textarea
              rows={2}
              value={form.contactSocialIntro}
              onChange={(e) => set("contactSocialIntro", e.target.value)}
              placeholder="مثلاً: بلا را در شبکه‌های اجتماعی دنبال کنید"
              className={inputCls}
            />
            <span className="form-hint">خالی بگذارید تا هیچ متنی نمایش داده نشود.</span>
          </label>

          <div className="mt-5 flex items-center justify-between">
            <h3 className="text-xs font-black text-cream">کانال‌های اجتماعی</h3>
            <button
              type="button"
              onClick={resetSocials}
              className="inline-flex items-center gap-1.5 text-[11px] text-sage hover:text-gold-soft"
            >
              <RotateCcw size={12} /> بازگرداندن به پیش‌فرض
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {socials.length === 0 && (
              <p className="rounded-xl glass-soft p-4 text-center text-[11px] text-sage">
                هیچ کانالی ثبت نشده — این بخش در صفحهٔ تماس مخفی می‌ماند.
              </p>
            )}
            {socials.map((sc, i) => (
              <div key={i} className="rounded-2xl glass-soft p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: socialColor(sc) }}
                  >
                    <SocialGlyph icon={sc.icon} size={18} />
                  </span>
                  <input
                    value={sc.name}
                    onChange={(e) => setSocial(i, { name: e.target.value })}
                    placeholder="نام کانال — مثلاً اینستاگرام"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => moveSocial(i, -1)}
                    className="rounded-lg border border-gold/25 p-2 text-gold-soft hover:bg-gold/10"
                    aria-label="بالا"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSocial(i, 1)}
                    className="rounded-lg border border-gold/25 p-2 text-gold-soft hover:bg-gold/10"
                    aria-label="پایین"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSocial(i)}
                    className="rounded-lg border border-rose-400/30 p-2 text-rose-300 hover:bg-rose-400/10"
                    aria-label="حذف"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <div className="relative">
                    <input
                      dir="ltr"
                      value={sc.href}
                      onChange={(e) => setSocial(i, { href: e.target.value })}
                      onBlur={(e) =>
                        setSocial(i, { href: normaliseLink(e.target.value) })
                      }
                      placeholder="instagram.com/bella_perfume1985"
                      className={inputCls}
                    />
                    <Link2
                      size={13}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sage/60"
                    />
                  </div>
                  <select
                    value={sc.icon}
                    onChange={(e) =>
                      setSocial(i, { icon: e.target.value as SocialIconKey })
                    }
                    className={inputCls}
                  >
                    {SOCIAL_ICON_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {SOCIAL_ICON_LABELS[key]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="color"
                    value={socialColor(sc)}
                    onChange={(e) => setSocial(i, { color: e.target.value })}
                    title="رنگ آیکن"
                    className="glass-swatch h-10 w-14 cursor-pointer rounded-xl"
                  />
                </div>
                {sc.href.trim() && !linkIsUsable(sc.href) && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-300">
                    <AlertCircle size={12} />
                    این لینک قابل استفاده نیست و ذخیره نخواهد شد.
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addSocial}
            className="btn-sky mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold"
          >
            <Plus size={14} /> کانال جدید
          </button>

          <h3 className="mt-6 text-xs font-black text-cream">کارت‌های تماس</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="form-label">تلفن مشاوره</span>
              <input
                value={form.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="form-label">ایمیل سایت</span>
              <input
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                placeholder="info@bellaperfume.ir"
                dir="ltr"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="form-label">نشانی بوتیک</span>
              <input
                value={form.contactAddress}
                onChange={(e) => set("contactAddress", e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="form-label">ساعات پاسخگویی</span>
              <input
                value={form.contactHours}
                onChange={(e) => set("contactHours", e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-sage">
            هر کدام را خالی بگذارید، همان کارت حذف می‌شود. ایمیل را که وارد
            کنید، کارت آن در صفحهٔ تماس کلیک‌پذیر می‌شود (نامه‌نویسی مستقیم).
          </p>

          {saveBar}
        </section>
      )}

      {/* ================= روش‌های ورود ================= */}
      {tab === "login" && (
        <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-gold">
            <LogIn size={16} />
            <h2 className="text-sm font-black">روش‌های ورود با کد یک‌بارمصرف</h2>
          </div>
          <p className="mt-1 text-[11px] leading-6 text-sage">
            مشخص کنید کاربران و مدیر اصلی کد ورود را با پیامک، ایمیل یا هر دو دریافت
            کنند. این محدودیت روی سرور هم اعمال می‌شود و فقط مخفی‌کردن گزینه در صفحه
            نیست. برای جلوگیری از قفل‌شدن پنل، حداقل یک روش باید فعال بماند.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  key: "loginPhoneEnabled",
                  title: "ورود با شماره موبایل",
                  desc: "کد یک‌بارمصرف با پیامک ارسال می‌شود؛ ثبت‌نام خودکار کاربران تازه نیز از این روش انجام می‌شود.",
                  icon: Smartphone,
                },
                {
                  key: "loginEmailEnabled",
                  title: "ورود با ایمیل",
                  desc: "کد به ایمیل ارسال می‌شود و برای ایمیل تازه نیز حساب بدون نیاز به شماره ساخته می‌شود.",
                  icon: Mail,
                },
              ] as const
            ).map(({ key, title, desc, icon: Icon }) => {
              const active = form[key] === "1";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleLoginMethod(key)}
                  aria-pressed={active}
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-right transition ${
                    active
                      ? "border-emerald-300/40 bg-emerald-300/10"
                      : "border-gold/15 glass-soft opacity-70"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                      active
                        ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-200"
                        : "border-gold/25 text-sage"
                    }`}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-cream">{title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          active
                            ? "bg-emerald-300/15 text-emerald-200"
                            : "bg-white/5 text-sage"
                        }`}
                      >
                        {active ? "فعال" : "غیرفعال"}
                      </span>
                    </span>
                    <span className="mt-1.5 block text-[10.5px] leading-5 text-sage">
                      {desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3 text-[10.5px] leading-6 text-amber-100/80">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-300" />
            <span>
              این انتخاب روی ورود مدیر هم اثر دارد. پیش از غیرفعال‌کردن یک روش، مطمئن
              شوید روش باقی‌مانده و سرویس ارسال کد آن واقعاً کار می‌کند.
            </span>
          </div>

          {saveBar}
        </section>
      )}

      {/* ================= v33: پرداخت و نگهداری ================= */}
      {tab === "terms" && (
        <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-gold">
            <ScrollText size={16} />
            <h2 className="text-sm font-black">صفحهٔ قوانین و مقررات</h2>
          </div>
          <p className="mt-1.5 text-[11px] leading-6 text-sage">
            عنوان و متن صفحهٔ «قوانین و مقررات» (آدرس /terms در فوتر سایت) از
            همین‌جا قابل تغییر است. هر خط یک پاراگراف است؛ خطی که با ## شروع
            شود به‌عنوان تیتر بخش نمایش داده می‌شود.
          </p>

          <label className="mt-4 block">
            <span className="form-label">عنوان صفحه</span>
            <input
              value={form.termsTitle}
              onChange={(e) => set("termsTitle", e.target.value)}
              placeholder="قوانین و مقررات بلا پرفیوم"
              className={inputCls}
            />
            <span className="form-hint">خالی بگذارید تا عنوان پیش‌فرض نمایش داده شود.</span>
          </label>

          <label className="mt-4 block">
            <span className="form-label">متن قوانین</span>
            <textarea
              rows={12}
              value={form.termsText}
              onChange={(e) => set("termsText", e.target.value)}
              placeholder={"متن قوانین...\n## عنوان بخش\n۱. متن بند اول"}
              className={inputCls}
            />
            <span className="form-hint">
              هر خط یک پاراگراف — برای تیتر بخش، خط را با ## شروع کنید. (حداکثر ۲۰٬۰۰۰ کاراکتر)
            </span>
          </label>

          {saveBar}
        </section>
      )}

      
      {tab === "sms" && (
        <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-gold">
            <MessageSquare size={16} />
            <h2 className="text-sm font-black">پیامک‌ها و ایمیل‌های سایت</h2>
          </div>
          <p className="mt-1.5 text-[11px] leading-6 text-sage">
            سرویس ارسال پیامک: <b>sms.ir</b>. متن هر پیامک را در پنل sms.ir (بخش
            «ارسال سریع» / قالب‌ها) تعریف و تأیید کنید، سپس شناسهٔ قالبش را
            این‌جا وارد کنید. کلید API در فایل .env سرور با نام
            <span className="mx-1 font-mono text-gold-soft">SMSIR_API_KEY</span>
            تنظیم می‌شود. سرویس ایمیل: SMTP Gmail (MAIL_PROVIDER=smtp در .env).
            برای هر رویداد می‌توانید پیامک و ایمیل را جداگانه روشن/خاموش کنید — وقتی هر دو فعال باشند، هر دو همزمان ارسال می‌شوند.
          </p>

          <p className="mt-4 text-[11px] font-black text-gold-soft">تنظیمات کلی — خط و ایمیل مدیر</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="form-label">شماره خط sms.ir</span>
              <input
                value={form.smsirLine}
                onChange={(e) => set("smsirLine", e.target.value)}
                placeholder="مثلاً 30004505000017"
                inputMode="numeric"
                className={inputCls}
              />
              <span className="form-hint">خط اختصاصی پنل sms.ir برای ارسال bulk.</span>
            </label>
            <label className="block">
              <span className="form-label">شناسهٔ قالب کد ورود sms.ir</span>
              <input
                value={form.smsirTemplateId}
                onChange={(e) => set("smsirTemplateId", e.target.value)}
                placeholder="مثلاً 123456"
                inputMode="numeric"
                className={inputCls}
              />
              <span className="form-hint">خالی = متن پیش‌فرض از خط اختصاصی.</span>
            </label>
            <label className="block">
              <span className="form-label">نام پارامتر کد در قالب</span>
              <input
                value={form.smsirOtpParam}
                onChange={(e) => set("smsirOtpParam", e.target.value)}
                placeholder="Code"
                className={inputCls}
              />
              <span className="form-hint">معمولاً Code یا CODE.</span>
            </label>
            <label className="block">
              <span className="form-label">ایمیل مدیر (برای اطلاع‌رسانی‌ها)</span>
              <input
                value={form.emailAdmin}
                onChange={(e) => set("emailAdmin", e.target.value)}
                placeholder="admin@bellaperfume.ir"
                dir="ltr"
                className={inputCls}
              />
              <span className="form-hint">مقصد ایمیل‌های سفارش جدید و لغو.</span>
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="form-label">شماره موبایل مدیر (پیامک)</span>
              <input
                value={form.smsAdminPhone}
                onChange={(e) => set("smsAdminPhone", e.target.value)}
                placeholder="مثلاً 09121234567"
                inputMode="tel"
                className={inputCls}
              />
              <span className="form-hint">مقصد پیامک‌های مدیر.</span>
            </label>
            <label className="block">
              <span className="form-label">ایمیل سایت (تماس)</span>
              <input
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                placeholder="info@bellaperfume.ir"
                dir="ltr"
                className={inputCls}
              />
              <span className="form-hint">در صورت خالی بودن emailAdmin، از این ایمیل برای مدیر استفاده می‌شود.</span>
            </label>
          </div>

          {/* ---------- کد تأیید ---------- */}
          <div className="mt-6 rounded-xl border border-gold/15 glass-soft p-3.5">
            <p className="text-xs font-black text-cream">کد تأیید ورود / تغییر مشخصات</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => set("smsOtpEnabled", form.smsOtpEnabled === "1" ? "" : "1")}
                className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.smsOtpEnabled === "1" ? "border-emerald-300/40 bg-emerald-300/10" : "border-gold/20"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.smsOtpEnabled === "1" ? "border-emerald-300 bg-emerald-300 text-[#241a05]" : "border-gold/40"}`}>
                  {form.smsOtpEnabled === "1" && <Check size={12} />}
                </span>
                <span className="text-xs font-bold text-cream">📱 پیامک کد تأیید فعال</span>
              </button>
              <button
                type="button"
                onClick={() => set("emailOtpEnabled", form.emailOtpEnabled === "1" ? "" : "1")}
                className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.emailOtpEnabled === "1" ? "border-sky-300/40 bg-sky-300/10" : "border-gold/20"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.emailOtpEnabled === "1" ? "border-sky-300 bg-sky-300 text-[#241a05]" : "border-gold/40"}`}>
                  {form.emailOtpEnabled === "1" && <Check size={12} />}
                </span>
                <span className="text-xs font-bold text-cream">✉️ ایمیل کد تأیید فعال</span>
              </button>
            </div>
          </div>

          {/* ---------- ثبت سفارش - مشتری ---------- */}
          <div className="mt-4 rounded-xl border border-gold/15 glass-soft p-3.5">
            <p className="text-xs font-black text-cream">بعد از ثبت سفارش — مشتری</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => set("smsOrderPlacedEnabled", form.smsOrderPlacedEnabled === "1" ? "" : "1")}
                className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.smsOrderPlacedEnabled === "1" ? "border-emerald-300/40 bg-emerald-300/10" : "border-gold/20"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.smsOrderPlacedEnabled === "1" ? "border-emerald-300 bg-emerald-300 text-[#241a05]" : "border-gold/40"}`}>
                  {form.smsOrderPlacedEnabled === "1" && <Check size={12} />}
                </span>
                <span className="text-xs font-bold text-cream">📱 پیامک ثبت سفارش</span>
              </button>
              <button
                type="button"
                onClick={() => set("emailOrderPlacedEnabled", form.emailOrderPlacedEnabled === "1" ? "" : "1")}
                className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.emailOrderPlacedEnabled === "1" ? "border-sky-300/40 bg-sky-300/10" : "border-gold/20"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.emailOrderPlacedEnabled === "1" ? "border-sky-300 bg-sky-300 text-[#241a05]" : "border-gold/40"}`}>
                  {form.emailOrderPlacedEnabled === "1" && <Check size={12} />}
                </span>
                <span className="text-xs font-bold text-cream">✉️ ایمیل ثبت سفارش</span>
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="form-label">شناسهٔ قالب sms.ir</span>
                <input value={form.smsirOrderPlacedTemplate} onChange={(e) => set("smsirOrderPlacedTemplate", e.target.value)} placeholder="شناسه قالب" inputMode="numeric" className={inputCls} />
              </label>
              <label className="block">
                <span className="form-label">نام پارامترها (ORDERID, NAME, TOTAL)</span>
                <input value={form.smsirOrderPlacedParams} onChange={(e) => set("smsirOrderPlacedParams", e.target.value)} placeholder="ORDERID, NAME, TOTAL" className={inputCls} />
              </label>
            </div>
          </div>

          {/* ---------- سفارش جدید - مدیر ---------- */}
          <div className="mt-4 rounded-xl border border-gold/15 glass-soft p-3.5">
            <p className="text-xs font-black text-cream">سفارش جدید — اطلاع به مدیر</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => set("smsAdminNotifyEnabled", form.smsAdminNotifyEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.smsAdminNotifyEnabled === "1" ? "border-emerald-300/40 bg-emerald-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.smsAdminNotifyEnabled === "1" ? "border-emerald-300 bg-emerald-300 text-[#241a05]" : "border-gold/40"}`}>{form.smsAdminNotifyEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">📱 پیامک به مدیر</span>
              </button>
              <button type="button" onClick={() => set("emailAdminNotifyEnabled", form.emailAdminNotifyEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.emailAdminNotifyEnabled === "1" ? "border-sky-300/40 bg-sky-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.emailAdminNotifyEnabled === "1" ? "border-sky-300 bg-sky-300 text-[#241a05]" : "border-gold/40"}`}>{form.emailAdminNotifyEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">✉️ ایمیل به مدیر</span>
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="form-label">شناسهٔ قالب مدیر</span>
                <input value={form.smsirAdminOrderTemplate} onChange={(e) => set("smsirAdminOrderTemplate", e.target.value)} placeholder="شناسه قالب" inputMode="numeric" className={inputCls} />
              </label>
              <label className="block">
                <span className="form-label">نام پارامترها (ORDERID, NAME, TOTAL, PHONE)</span>
                <input value={form.smsirAdminOrderParams} onChange={(e) => set("smsirAdminOrderParams", e.target.value)} placeholder="ORDERID, NAME, TOTAL, PHONE" className={inputCls} />
              </label>
            </div>
          </div>

          {/* ---------- تغییر وضعیت ---------- */}
          <div className="mt-4 rounded-xl border border-gold/15 glass-soft p-3.5">
            <p className="text-xs font-black text-cream">تغییر وضعیت سفارش — مشتری</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => set("smsOrderStatusEnabled", form.smsOrderStatusEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.smsOrderStatusEnabled === "1" ? "border-emerald-300/40 bg-emerald-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.smsOrderStatusEnabled === "1" ? "border-emerald-300 bg-emerald-300 text-[#241a05]" : "border-gold/40"}`}>{form.smsOrderStatusEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">📱 پیامک تغییر وضعیت</span>
              </button>
              <button type="button" onClick={() => set("emailOrderStatusEnabled", form.emailOrderStatusEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.emailOrderStatusEnabled === "1" ? "border-sky-300/40 bg-sky-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.emailOrderStatusEnabled === "1" ? "border-sky-300 bg-sky-300 text-[#241a05]" : "border-gold/40"}`}>{form.emailOrderStatusEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">✉️ ایمیل تغییر وضعیت</span>
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="form-label">شناسهٔ قالب تغییر وضعیت</span>
                <input value={form.smsirOrderStatusTemplate} onChange={(e) => set("smsirOrderStatusTemplate", e.target.value)} placeholder="شناسه قالب" inputMode="numeric" className={inputCls} />
              </label>
              <label className="block">
                <span className="form-label">نام پارامترها (ORDERID, STATUS)</span>
                <input value={form.smsirOrderStatusParams} onChange={(e) => set("smsirOrderStatusParams", e.target.value)} placeholder="ORDERID, STATUS" className={inputCls} />
              </label>
            </div>
          </div>

          {/* ---------- سبد رها شده 2 ساعته ---------- */}
          <div className="mt-4 rounded-xl border border-amber-300/20 glass-soft p-3.5">
            <p className="text-xs font-black text-cream">سبد رها شده — مرحله اول (2 ساعته)</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => set("smsAbandonedFirstEnabled", form.smsAbandonedFirstEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.smsAbandonedFirstEnabled === "1" ? "border-amber-300/40 bg-amber-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.smsAbandonedFirstEnabled === "1" ? "border-amber-300 bg-amber-300 text-[#241a05]" : "border-gold/40"}`}>{form.smsAbandonedFirstEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">📱 پیامک 2 ساعته</span>
              </button>
              <button type="button" onClick={() => set("emailAbandonedFirstEnabled", form.emailAbandonedFirstEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.emailAbandonedFirstEnabled === "1" ? "border-sky-300/40 bg-sky-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.emailAbandonedFirstEnabled === "1" ? "border-sky-300 bg-sky-300 text-[#241a05]" : "border-gold/40"}`}>{form.emailAbandonedFirstEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">✉️ ایمیل 2 ساعته</span>
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="form-label">شناسه قالب 2 ساعته</span><input value={form.smsirAbandonedFirstTemplate} onChange={(e) => set("smsirAbandonedFirstTemplate", e.target.value)} placeholder="شناسه قالب" inputMode="numeric" className={inputCls} /></label>
              <label className="block"><span className="form-label">نام پارامترها (NAME, TOTAL)</span><input value={form.smsirAbandonedFirstParams} onChange={(e) => set("smsirAbandonedFirstParams", e.target.value)} placeholder="NAME, TOTAL" className={inputCls} /></label>
            </div>
          </div>

          {/* ---------- سبد رها شده 12 ساعته ---------- */}
          <div className="mt-4 rounded-xl border border-amber-300/20 glass-soft p-3.5">
            <p className="text-xs font-black text-cream">سبد رها شده — مرحله دوم (12 ساعته)</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => set("smsAbandonedSecondEnabled", form.smsAbandonedSecondEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.smsAbandonedSecondEnabled === "1" ? "border-amber-300/40 bg-amber-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.smsAbandonedSecondEnabled === "1" ? "border-amber-300 bg-amber-300 text-[#241a05]" : "border-gold/40"}`}>{form.smsAbandonedSecondEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">📱 پیامک 12 ساعته</span>
              </button>
              <button type="button" onClick={() => set("emailAbandonedSecondEnabled", form.emailAbandonedSecondEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.emailAbandonedSecondEnabled === "1" ? "border-sky-300/40 bg-sky-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.emailAbandonedSecondEnabled === "1" ? "border-sky-300 bg-sky-300 text-[#241a05]" : "border-gold/40"}`}>{form.emailAbandonedSecondEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">✉️ ایمیل 12 ساعته</span>
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="form-label">شناسه قالب 12 ساعته</span><input value={form.smsirAbandonedSecondTemplate} onChange={(e) => set("smsirAbandonedSecondTemplate", e.target.value)} placeholder="شناسه قالب" inputMode="numeric" className={inputCls} /></label>
              <label className="block"><span className="form-label">نام پارامترها (NAME, TOTAL)</span><input value={form.smsirAbandonedSecondParams} onChange={(e) => set("smsirAbandonedSecondParams", e.target.value)} placeholder="NAME, TOTAL" className={inputCls} /></label>
            </div>
          </div>

          {/* ---------- گزارش لغو سفارش به ادمین ---------- */}
          <div className="mt-4 rounded-xl border border-red-300/25 bg-red-500/[0.06] p-3.5">
            <p className="text-xs font-black text-red-200">🚨 گزارش لغو سفارش — اطلاع به مدیر (کد، نام، تلفن، مبلغ)</p>
            <p className="mt-1 text-[10.5px] leading-5 text-red-200/70">وقتی مشتری از حساب کاربری درخواست لغو می‌دهد، این اطلاع‌رسانی با جزئیات کامل برای مدیر ارسال می‌شود.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => set("smsCancelAdminEnabled", form.smsCancelAdminEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.smsCancelAdminEnabled === "1" ? "border-red-300/40 bg-red-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.smsCancelAdminEnabled === "1" ? "border-red-300 bg-red-300 text-[#241a05]" : "border-gold/40"}`}>{form.smsCancelAdminEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">📱 پیامک لغو به مدیر</span>
              </button>
              <button type="button" onClick={() => set("emailCancelAdminEnabled", form.emailCancelAdminEnabled === "1" ? "" : "1")} className={`flex items-center gap-2 rounded-xl border p-3 text-right transition ${form.emailCancelAdminEnabled === "1" ? "border-sky-300/40 bg-sky-300/10" : "border-gold/20"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${form.emailCancelAdminEnabled === "1" ? "border-sky-300 bg-sky-300 text-[#241a05]" : "border-gold/40"}`}>{form.emailCancelAdminEnabled === "1" && <Check size={12} />}</span>
                <span className="text-xs font-bold text-cream">✉️ ایمیل لغو به مدیر</span>
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="form-label">شناسه قالب لغو (sms.ir)</span><input value={form.smsirCancelAdminTemplate} onChange={(e) => set("smsirCancelAdminTemplate", e.target.value)} placeholder="شناسه قالب" inputMode="numeric" className={inputCls} /></label>
              <label className="block"><span className="form-label">نام پارامترها (ORDERID, NAME, TOTAL, PHONE)</span><input value={form.smsirCancelAdminParams} onChange={(e) => set("smsirCancelAdminParams", e.target.value)} placeholder="ORDERID, NAME, TOTAL, PHONE" className={inputCls} /><span className="form-hint">به ترتیب: کد پیگیری، نام، مبلغ، تلفن — هر 4 تا برای گزارش لغو.</span></label>
            </div>
          </div>

          {/* ---- ارسال تست ---- */}
          <div className="mt-5 rounded-xl border border-gold/20 glass-soft p-3.5">
            <span className="form-label">ارسال پیامک تست (با متن‌های ذخیره‌شده)</span>
            <p className="mt-0.5 text-[11px] leading-5 text-sage">تست با متن‌های <b>ذخیره‌شده</b> ارسال می‌شود؛ اول تغییرات بالا را ذخیره کنید.</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <input value={smsTestPhone} onChange={(e) => setSmsTestPhone(e.target.value)} placeholder="09xxxxxxxxx" inputMode="tel" className={`${inputCls} max-w-[180px]`} />
              {(
                [
                  ["otp", "تست کد تأیید"],
                  ["orderPlaced", "تست ثبت سفارش"],
                  ["orderPlacedAdmin", "تست سفارش مدیر"],
                  ["orderStatus", "تست تغییر وضعیت"],
                  ["abandonedFirst", "تست سبد 2ساعته"],
                  ["abandonedSecond", "تست سبد 12ساعته"],
                  ["cancelAdmin", "تست لغو سفارش 🚨"],
                ] as const
              ).map(([activity, label]) => (
                <button key={activity} type="button" disabled={smsTestBusy} onClick={() => sendSmsTest(activity)} className="rounded-full border border-gold/40 px-3.5 py-2 text-[11px] font-bold text-gold transition hover:bg-gold/10 disabled:opacity-50">{label}</button>
              ))}
              <button type="button" disabled={smsCreditBusy} onClick={checkSmsCredit} className="rounded-full border border-cyan-300/40 px-3.5 py-2 text-[11px] font-bold text-cyan-200 transition hover:bg-cyan-300/10 disabled:opacity-50">{smsCreditBusy ? "در حال بررسی…" : "بررسی اعتبار"}</button>
            </div>
            {smsCreditText && <p className="mt-2.5 text-[11.5px] font-bold text-cyan-200">{smsCreditText}</p>}
            {smsTestResult && (
              <div className={`mt-2.5 rounded-lg border p-2.5 text-[11.5px] leading-6 ${smsTestResult.ok ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-red-300/40 bg-red-300/10 text-red-100"}`}>
                {smsTestResult.error ? <b>{smsTestResult.error}</b> : <b>پیامک تست ارسال شد ✓</b>}
                {smsTestResult.preview && <pre className="mt-1.5 whitespace-pre-wrap font-sans text-sage">{smsTestResult.preview}</pre>}
              </div>
            )}
          </div>

          {saveBar}
        </section>
      )}

{tab === "cart" && (
        <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-amber-300">
            <ShoppingBasket size={16} />
            <h2 className="text-sm font-black">سبد خرید رها شده - پیگیری خودکار</h2>
          </div>
          <p className="mt-1.5 text-[11px] leading-6 text-sage">
            وقتی مشتری لاگین کرده و چیزی داخل سبد دارد اما خرید را کامل نمی‌کند، بعد از زمان‌های زیر پیامک یادآوری ارسال می‌شود.
            سبد به‌صورت خودکار روی سرور ذخیره می‌شود و بعد از ثبت سفارش، پاک می‌شود.
          </p>

          <button
            type="button"
            onClick={() => set("abandonedCartEnabled", form.abandonedCartEnabled === "1" ? "" : "1")}
            className={`mt-4 flex w-full items-center gap-3 rounded-xl border p-3.5 text-right transition ${form.abandonedCartEnabled === "1" ? "border-emerald-300/40 bg-emerald-300/10" : "border-gold/20 glass-soft"}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${form.abandonedCartEnabled === "1" ? "border-emerald-300 bg-emerald-300 text-[#241a05]" : "border-gold/40"}`}
            >
              {form.abandonedCartEnabled === "1" && <Check size={14} />}
            </span>
            <span>
              <span className="block text-sm font-black text-cream">پیگیری سبد رها شده فعال باشد</span>
              <span className="mt-0.5 block text-[11px] text-sage">
                {form.abandonedCartEnabled === "1" ? "سیستم هر 5 دقیقه سبدها را چک می‌کند و پیامک می‌فرستد." : "پیگیری سبد غیرفعال است."}
              </span>
            </span>
          </button>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="form-label">ساعت یادآوری اول (پیش‌فرض 2 ساعت)</span>
              <input
                type="number"
                min={1}
                max={168}
                value={form.abandonedCartFirstHours}
                onChange={(e) => set("abandonedCartFirstHours", e.target.value)}
                className={inputCls}
                placeholder="2"
              />
            </label>
            <label className="block">
              <span className="form-label">ساعت یادآوری دوم (پیش‌فرض 12 ساعت)</span>
              <input
                type="number"
                min={1}
                max={720}
                value={form.abandonedCartSecondHours}
                onChange={(e) => set("abandonedCartSecondHours", e.target.value)}
                className={inputCls}
                placeholder="12"
              />
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3 text-[10.5px] leading-6 text-amber-100/80">
            <p>💡 نکته: متن پیامک‌ها را در تب «پیامک‌ها» تنظیم کنید (قالب‌های سبد 2 ساعته و 12 ساعته). پارامترهای پیشنهادی: NAME (نام مشتری) و TOTAL (مبلغ سبد).</p>
          </div>

          {saveBar}
        </section>
      )}

      {tab === "maintenance" && (
        <section className="gold-ring mt-2 rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-gold">
            <ShieldCheck size={16} />
            <h2 className="text-sm font-black">تنظیمات تراکنش</h2>
          </div>
          <p className="mt-1 text-[11px] leading-6 text-sage">
            تنظیمات اعتبارسنجی خودکار و غیرخودکار تراکنش‌های پرداخت الکترونیکی
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  on: true,
                  title: "خودکار",
                  desc: "پس از انجام پرداخت، زرین‌پال تراکنش را به‌صورت خودکار تأیید می‌کند.",
                },
                {
                  on: false,
                  title: "غیرخودکار",
                  desc: "پس از انجام پرداخت، پذیرنده تراکنش را از طریق API اعتبارسنجی تراکنش، تأیید نهایی می‌کند.",
                },
              ] as const
            ).map((opt) => {
              const active = (form.zarinpalAutoVerify === "1") === opt.on;
              return (
                <button
                  key={opt.title}
                  type="button"
                  onClick={() => set("zarinpalAutoVerify", opt.on ? "1" : "")}
                  className={`rounded-xl border p-3.5 text-right transition ${
                    active ? "border-gold/70 bg-gold/10 ring-1 ring-gold/40" : "border-gold/20 glass-soft"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
                        active ? "border-gold" : "border-sage/60"
                      }`}
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-[#6b2c4e]" />}
                    </span>
                    <span className="text-sm font-black text-[#241a22]">{opt.title}</span>
                  </span>
                  <span className="mt-1.5 block text-[11px] leading-5 text-sage">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          {form.zarinpalAutoVerify === "1" ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-orange-300/50 bg-orange-300/10 p-3 text-[10.5px] leading-5 text-[#7a4a12]">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              در حالت خودکار، اگر مشتری پس از پرداخت به سایت بازنگردد مبلغ تا پایان روز برداشت می‌شود؛
              عودت چنین تراکنش‌هایی (مثلاً سفارش منقضی‌شده) دستی و از پنل زرین‌پال انجام می‌شود.
              در حالت غیرخودکار، پرداخت تأییدنشده خودش به حساب مشتری برمی‌گردد.
            </p>
          ) : null}

          <p className="mt-2 text-[11px] leading-6 text-sage">
            برای اطلاعات بیشتر، نحوه استفاده از API و مشاهده راهنمای اتصال و نمونه کدها{" "}
            <a
              href="https://www.zarinpal.com/docs/apiDocs/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-gold hover:underline"
            >
              کلیک کنید <ExternalLink size={11} />
            </a>
            .
          </p>

          <div className="my-5 h-px bg-gold/15" />

          <div className="flex items-center gap-2 text-gold">
            <AlertCircle size={16} />
            <h2 className="text-sm font-black">حالت به‌روزرسانی سایت</h2>
          </div>
          <p className="mt-1 text-[11px] leading-6 text-sage">
            با روشن‌کردن این کلید، ثبت سفارش جدید و رفتن به درگاه پرداخت برای
            همهٔ کاربران بسته می‌شود. بقیهٔ سایت — فروشگاه، آموزش‌ها و حساب کاربری —
            مثل قبل کار می‌کند. این محدودیت روی سرور اعمال می‌شود، پس با دور زدن صفحه
            هم نمی‌توان سفارش ثبت کرد.
          </p>

          <button
            type="button"
            onClick={() => set("paymentsDisabled", form.paymentsDisabled === "1" ? "" : "1")}
            className={`mt-4 flex w-full items-center gap-3 rounded-xl border p-3.5 text-right transition ${
              form.paymentsDisabled === "1"
                ? "border-orange-300/40 bg-orange-300/10"
                : "border-gold/20 glass-soft"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                form.paymentsDisabled === "1"
                  ? "border-orange-300 bg-orange-300 text-[#241a05]"
                  : "border-gold/40"
              }`}
            >
              {form.paymentsDisabled === "1" && <Check size={14} />}
            </span>
            <span>
              <span className="block text-sm font-black text-cream">
                فعلاً سفارش و پرداخت غیرفعال باشد
              </span>
              <span className="mt-0.5 block text-[11px] text-sage">
                {form.paymentsDisabled === "1"
                  ? "فروشگاه در حالت به‌روزرسانی است و سفارشی ثبت نمی‌شود."
                  : "فروشگاه باز است و سفارش‌ها عادی ثبت می‌شوند."}
              </span>
            </span>
          </button>

          <label className="mt-4 block">
            <span className="form-label">پیامی که به مشتری نشان داده می‌شود</span>
            <textarea
              rows={3}
              value={form.paymentsDisabledNote}
              onChange={(e) => set("paymentsDisabledNote", e.target.value)}
              placeholder="فروشگاه به‌دلیل به‌روزرسانی موقتاً سفارش نمی‌پذیرد."
              className={`${inputCls} leading-7`}
            />
          </label>

          {saveBar}
        </section>
      )}

    </div>
  );
}

const inputCls =
  "w-full rounded-xl glass-input px-3.5 py-2.5 text-sm text-cream placeholder:text-sage/40 focus:border-gold focus:outline-none";
