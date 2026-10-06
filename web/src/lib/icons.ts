// ---------------------------------------------------------------------------
// Self-hosted icon pack.
//
// Every icon is a plain SVG file shipped inside `web/public/icons/`, so the
// storefront never asks a third-party icon CDN for anything at runtime and the
// site keeps working offline / behind a firewall.
//
// To add a new icon: drop `my-icon.svg` into `web/public/icons/` and add its
// name + Persian label to the two lists below. Nothing else needs to change,
// because the admin icon picker is generated from ICON_NAMES.
// ---------------------------------------------------------------------------

export const ICON_NAMES = [
  "bottle",
  "sparkles",
  "gift",
  "crown",
  "gem",
  "heart",
  "star",
  "medal",
  "rose",
  "leaf",
  "flame",
  "droplet",
  "moon",
  "sun",
  "brain",
  "shield-check",
  "lock",
  "truck",
  "box",
  "tag",
  "clock",
  "headset",
  "mail",
  "phone",
  // --- added in v23: general UI, commerce and fragrance-family icons ---
  "search",
  "cart",
  "user",
  "users",
  "home",
  "map-pin",
  "credit-card",
  "wallet",
  "coins",
  "percent",
  "zap",
  "trophy",
  "thumbs-up",
  "chat",
  "bell",
  "calendar",
  "refresh",
  "check-circle",
  "info",
  "key",
  "eye",
  "bookmark",
  "smile",
  "globe",
  "snowflake",
  "waves",
  "wind",
  "feather",
  "flower",
  "tree",
  "citrus",
  "coffee",
  "music",
  "camera",
  "chart",
  "settings",
  "pen",
  "qr",
  "bow",
  "ribbon",
  "party-popper",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Persian labels shown in the admin icon picker. */
export const ICON_LABELS: Record<IconName, string> = {
  bottle: "شیشه عطر",
  sparkles: "درخشش",
  gift: "هدیه",
  crown: "تاج",
  gem: "الماس",
  heart: "قلب",
  star: "ستاره",
  medal: "مدال",
  rose: "گل رز",
  leaf: "برگ",
  flame: "شعله",
  droplet: "قطره",
  moon: "ماه",
  sun: "خورشید",
  brain: "ذهن",
  "shield-check": "ضمانت اصالت",
  lock: "قفل و امنیت",
  truck: "ارسال",
  box: "بسته‌بندی",
  tag: "برچسب قیمت",
  clock: "زمان",
  headset: "پشتیبانی",
  mail: "ایمیل",
  phone: "تلفن",
  search: "جست‌وجو",
  cart: "سبد خرید",
  user: "کاربر",
  users: "مشتریان",
  home: "خانه",
  "map-pin": "موقعیت مکانی",
  "credit-card": "کارت بانکی",
  wallet: "کیف پول",
  coins: "قیمت مناسب",
  percent: "تخفیف",
  zap: "ارسال فوری",
  trophy: "جایزه",
  "thumbs-up": "رضایت مشتری",
  chat: "گفت‌وگو",
  bell: "اطلاع‌رسانی",
  calendar: "تقویم",
  refresh: "بازگشت کالا",
  "check-circle": "تأیید شده",
  info: "راهنما",
  key: "کلید",
  eye: "بازدید",
  bookmark: "نشان‌شده",
  smile: "خرسندی",
  globe: "ارسال جهانی",
  snowflake: "رایحه سرد",
  waves: "رایحه دریایی",
  wind: "رایحه ملایم",
  feather: "لطافت",
  flower: "رایحه گلی",
  tree: "رایحه چوبی",
  citrus: "رایحه مرکباتی",
  coffee: "رایحه قهوه",
  music: "هارمونی رایحه",
  camera: "گالری تصویر",
  chart: "نمودار فروش",
  settings: "تنظیمات",
  pen: "ویرایش",
  qr: "کد اصالت",
  bow: "پاپیون",
  ribbon: "روبان هدیه",
  "party-popper": "جشن و کاغذ رنگی",
};

/**
 * Every icon carries its own colour so the site is not a wall of identical
 * gold glyphs. SiteIcon paints the SVG through a CSS mask, so these values can
 * be any CSS colour and a caller can still override them per usage.
 */
export const ICON_TONES: Record<IconName, string> = {
  bottle: "#d4af37",
  sparkles: "#fbbf24",
  gift: "#f472b6",
  crown: "#fbbf24",
  gem: "#22d3ee",
  heart: "#fb7185",
  star: "#facc15",
  medal: "#f59e0b",
  rose: "#f472b6",
  leaf: "#4ade80",
  flame: "#fb923c",
  droplet: "#38bdf8",
  moon: "#a5b4fc",
  sun: "#facc15",
  brain: "#e879f9",
  "shield-check": "#34d399",
  lock: "#a78bfa",
  truck: "#60a5fa",
  box: "#c8a27a",
  tag: "#f59e0b",
  clock: "#7dd3fc",
  headset: "#2dd4bf",
  mail: "#38bdf8",
  phone: "#4ade80",
  search: "#cbd5e1",
  cart: "#fbbf24",
  user: "#7dd3fc",
  users: "#a78bfa",
  home: "#4ade80",
  "map-pin": "#f87171",
  "credit-card": "#60a5fa",
  wallet: "#34d399",
  coins: "#facc15",
  percent: "#f472b6",
  zap: "#fde047",
  trophy: "#fbbf24",
  "thumbs-up": "#4ade80",
  chat: "#38bdf8",
  bell: "#fb923c",
  calendar: "#a78bfa",
  refresh: "#2dd4bf",
  "check-circle": "#34d399",
  info: "#7dd3fc",
  key: "#facc15",
  eye: "#cbd5e1",
  bookmark: "#fb7185",
  smile: "#fde047",
  globe: "#38bdf8",
  snowflake: "#a5f3fc",
  waves: "#22d3ee",
  wind: "#bae6fd",
  feather: "#d8b4fe",
  flower: "#f9a8d4",
  tree: "#4ade80",
  citrus: "#fb923c",
  coffee: "#c8a27a",
  music: "#e879f9",
  camera: "#cbd5e1",
  chart: "#34d399",
  settings: "#cbd5e1",
  pen: "#fbbf24",
  qr: "#a3e635",
  bow: "#f472b6",
  ribbon: "#f9a8d4",
  "party-popper": "#fbbf24",
};

/** Colour for a stored icon name, falling back exactly like `iconUrl` does. */
export function iconTone(name: string | undefined, fallback: IconName = "sparkles") {
  return ICON_TONES[isIconName(name) ? name : fallback];
}

const ICON_SET = new Set<string>(ICON_NAMES);

/** Type guard used by both the storefront and the admin form. */
export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && ICON_SET.has(value);
}

/**
 * Resolves a stored icon name to a public URL. Unknown names fall back to the
 * given default, so a bad value in the database can never break a section.
 */
export function iconUrl(name: string | undefined, fallback: IconName = "sparkles") {
  return `/icons/${isIconName(name) ? name : fallback}.svg`;
}

// ---------------------------------------------------------------------------
// Which icon each section of the site uses. Admins override these from
// «تنظیمات سایت → آیکن بخش‌های سایت»; anything missing falls back here.
// ---------------------------------------------------------------------------
export type SectionIconKey = "festival" | "quiz" | "brands" | "best" | "features" | "related" | "discounts";

export const SECTION_ICON_KEYS: SectionIconKey[] = [
  "festival",
  "discounts",
  "quiz",
  "brands",
  "best",
  "features",
  "related",
];

export const SECTION_ICON_LABELS: Record<SectionIconKey, string> = {
  festival: "بنر جشنواره",
  discounts: "کارت تخفیف‌ها",
  quiz: "آزمون عطرشناسی",
  brands: "برندهای صفحه اصلی",
  best: "پرفروش‌ترین‌ها",
  features: "مزیت‌های فروشگاه",
  related: "عطرهای مشابه",
};

export const DEFAULT_SECTION_ICONS: Record<SectionIconKey, IconName> = {
  festival: "bow",
  discounts: "percent",
  quiz: "brain",
  brands: "crown",
  best: "medal",
  features: "shield-check",
  related: "sparkles",
};

/** Parses the `sectionIcons` setting (a JSON object) defensively. */
export function parseSectionIcons(raw: string | undefined): Record<SectionIconKey, IconName> {
  const out = { ...DEFAULT_SECTION_ICONS };
  if (!raw || !raw.trim()) return out;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
    for (const key of SECTION_ICON_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (isIconName(value)) out[key] = value;
    }
    return out;
  } catch {
    return out;
  }
}

// ---------------------------------------------------------------------------
// «مزیت‌های فروشگاه» — the icon strip on the home page.
// ---------------------------------------------------------------------------
export type FeatureCard = {
  icon: IconName;
  title: string;
  desc: string;
};

export const DEFAULT_FEATURES: FeatureCard[] = [
  {
    icon: "shield-check",
    title: "ضمانت اصالت رایحه",
    desc: "هر شیشه با کد اصالت و فاکتور رسمی به دست شما می‌رسد.",
  },
  {
    icon: "truck",
    title: "ارسال سریع و بیمه‌شده",
    desc: "بسته‌بندی ضدضربه و ارسال به سراسر ایران در ۲۴ تا ۷۲ ساعت.",
  },
  {
    icon: "lock",
    title: "پرداخت امن",
    desc: "پرداخت از درگاه معتبر بانکی با رمز پویا و بازگشت وجه تضمینی.",
  },
  {
    icon: "headset",
    title: "مشاور رایحه",
    desc: "کارشناسان ما در انتخاب عطر متناسب با سلیقه‌تان همراه شما هستند.",
  },
];

/** Parses the `homeFeatures` setting (a JSON array) defensively. */
export function parseFeatures(
  raw: string | undefined,
  fallback: FeatureCard[] = DEFAULT_FEATURES
): FeatureCard[] {
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const cleaned = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const card = item as Partial<FeatureCard>;
        return {
          icon: isIconName(card.icon) ? card.icon : ("sparkles" as IconName),
          title: String(card.title ?? ""),
          desc: String(card.desc ?? ""),
        };
      })
      .filter((card) => card.title.trim());
    return cleaned.length ? cleaned : fallback;
  } catch {
    return fallback;
  }
}
