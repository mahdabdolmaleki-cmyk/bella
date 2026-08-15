// ---------------------------------------------------------------------------
// Iranian shipping / courier cost engine.
//
// DESIGN NOTE: the shipping cost is ALWAYS recomputed on the server from the
// province + the real cart weight. The browser only sends a *method key*
// ("tipax", "post-pishtaz", ...) — never a price — exactly like product prices
// in routes/orders.js. Otherwise a tampered request could pay 0 for shipping.
// ---------------------------------------------------------------------------

/** Free-shipping threshold in Toman (order subtotal, before shipping). */
export const FREE_SHIPPING_THRESHOLD = 5_000_000;

/** Grams assumed per bottle when the product has no explicit weight. */
const DEFAULT_ITEM_GRAMS = 450;
/** Packaging (velvet box + anti-shock filler + carton). */
const PACKAGING_GRAMS = 250;

// ---------------------------------------------------------------------------
// Zones — Iranian couriers price by distance zone, not by single flat rate.
// ---------------------------------------------------------------------------
export const ZONES = {
  tehran: { key: "tehran", label: "تهران" },
  near: { key: "near", label: "استان‌های هم‌جوار" },
  far: { key: "far", label: "سایر استان‌ها" },
};

export const PROVINCES = [
  "تهران",
  "البرز",
  "قم",
  "قزوین",
  "سمنان",
  "مرکزی",
  "اصفهان",
  "فارس",
  "خراسان رضوی",
  "خراسان شمالی",
  "خراسان جنوبی",
  "آذربایجان شرقی",
  "آذربایجان غربی",
  "اردبیل",
  "زنجان",
  "گیلان",
  "مازندران",
  "گلستان",
  "کردستان",
  "کرمانشاه",
  "همدان",
  "لرستان",
  "ایلام",
  "خوزستان",
  "چهارمحال و بختیاری",
  "کهگیلویه و بویراحمد",
  "بوشهر",
  "یزد",
  "کرمان",
  "هرمزگان",
  "سیستان و بلوچستان",
];

const PROVINCE_SET = new Set(PROVINCES);

/** Provinces reachable overnight from the Tehran warehouse. */
const NEAR_PROVINCES = new Set([
  "البرز",
  "قم",
  "قزوین",
  "سمنان",
  "مرکزی",
  "زنجان",
  "مازندران",
  "گیلان",
  "اصفهان",
  "همدان",
]);

export function zoneForProvince(province) {
  const p = String(province || "").trim();
  if (p === "تهران") return "tehran";
  if (NEAR_PROVINCES.has(p)) return "near";
  return "far";
}

export function isProvince(value) {
  const p = String(value ?? "").trim();
  return PROVINCE_SET.has(p) ? p : null;
}

// ---------------------------------------------------------------------------
// Courier catalogue
//
// base       : price for the first kilogram, per zone (Toman)
// perKg      : added price for every extra kilogram beyond the first
// days       : [min, max] working days for delivery
// codFee     : surcharge when the parcel is paid at the door
// insuranceRate : share of the goods value charged as insurance
// ---------------------------------------------------------------------------
export const SHIPPING_METHODS = [
  {
    key: "tipax",
    label: "تیپاکس",
    icon: "truck",
    desc: "تحویل درب منزل با بارکد رهگیری، پوشش سراسری",
    base: { tehran: 95_000, near: 135_000, far: 175_000 },
    perKg: { tehran: 25_000, near: 35_000, far: 45_000 },
    days: { tehran: [1, 2], near: [2, 3], far: [3, 5] },
    insuranceRate: 0.005,
    codSupported: true,
    codFee: 30_000,
    freeEligible: true,
  },
  {
    key: "post-pishtaz",
    label: "پست پیشتاز",
    icon: "box",
    desc: "اقتصادی‌ترین گزینه، تحویل توسط پست جمهوری اسلامی ایران",
    base: { tehran: 62_000, near: 84_000, far: 110_000 },
    perKg: { tehran: 18_000, near: 24_000, far: 32_000 },
    days: { tehran: [2, 3], near: [3, 5], far: [4, 7] },
    insuranceRate: 0.003,
    codSupported: false,
    codFee: 0,
    freeEligible: true,
  },
  {
    key: "chapar",
    label: "چاپار اکسپرس",
    icon: "clock",
    desc: "ارسال سریع بین‌شهری با بیمه کامل محموله",
    base: { tehran: 110_000, near: 150_000, far: 195_000 },
    perKg: { tehran: 28_000, near: 38_000, far: 48_000 },
    days: { tehran: [1, 1], near: [1, 2], far: [2, 4] },
    insuranceRate: 0.007,
    codSupported: true,
    codFee: 35_000,
    freeEligible: false,
  },
  {
    key: "peyk",
    label: "پیک موتوری تهران",
    icon: "headset",
    desc: "تحویل همان روز — فقط داخل شهر تهران",
    base: { tehran: 120_000, near: 0, far: 0 },
    perKg: { tehran: 0, near: 0, far: 0 },
    days: { tehran: [0, 1], near: [0, 0], far: [0, 0] },
    insuranceRate: 0,
    codSupported: true,
    codFee: 0,
    freeEligible: false,
    zones: ["tehran"], // not offered outside Tehran
  },
];

const METHOD_MAP = new Map(SHIPPING_METHODS.map((m) => [m.key, m]));

export const DEFAULT_SHIPPING_METHOD = "tipax";

export function getShippingMethod(key) {
  return METHOD_MAP.get(String(key || "").trim()) || null;
}

/** Total billable weight of the cart, in grams. */
export function cartWeightGrams(items = []) {
  const goods = items.reduce((sum, i) => {
    const qty = Math.max(1, Number(i?.qty) || 1);
    // A 100ml bottle is heavier than a 30ml one; scale from the volume when
    // the catalogue does not carry a real weight.
    const ml = Number(i?.sizeMl) || 100;
    const perUnit = Number(i?.weightGrams) || Math.round(DEFAULT_ITEM_GRAMS * (0.55 + ml / 220));
    return sum + perUnit * qty;
  }, 0);
  return goods + PACKAGING_GRAMS;
}

/** Couriers bill per started kilogram. */
function billableKg(grams) {
  return Math.max(1, Math.ceil(grams / 1000));
}

function roundToman(n) {
  // Iranian couriers quote in 1,000-Toman steps.
  return Math.round(n / 1000) * 1000;
}

/**
 * Quotes one courier.
 * @returns null when the courier does not serve the destination zone.
 */
export function quoteMethod(method, { zone, grams, subtotal, cod = false }) {
  if (!method) return null;
  if (Array.isArray(method.zones) && !method.zones.includes(zone)) return null;

  const kg = billableKg(grams);
  const base = method.base[zone] ?? method.base.far;
  const perKg = method.perKg[zone] ?? method.perKg.far;
  const weightCost = base + perKg * (kg - 1);
  const insurance = Math.round((Number(subtotal) || 0) * (method.insuranceRate || 0));
  const codFee = cod && method.codSupported ? method.codFee || 0 : 0;

  const listPrice = roundToman(weightCost + insurance + codFee);

  // Free shipping only applies to the standard couriers, and never swallows
  // the cash-on-delivery surcharge.
  const free =
    method.freeEligible && (Number(subtotal) || 0) >= FREE_SHIPPING_THRESHOLD;
  const cost = free ? codFee : listPrice;

  const [dMin, dMax] = method.days[zone] ?? method.days.far;

  return {
    key: method.key,
    label: method.label,
    icon: method.icon,
    desc: method.desc,
    cost,
    listPrice,
    free,
    insurance,
    codFee,
    weightGrams: grams,
    billableKg: kg,
    zone,
    etaDays: { min: dMin, max: dMax },
  };
}

/** Quotes every courier that serves the destination. */
export function quoteShipping({ province, items = [], subtotal = 0, cod = false }) {
  const zone = zoneForProvince(province);
  const grams = cartWeightGrams(items);
  const options = SHIPPING_METHODS.map((m) =>
    quoteMethod(m, { zone, grams, subtotal, cod })
  ).filter(Boolean);

  return {
    zone,
    zoneLabel: ZONES[zone].label,
    weightGrams: grams,
    billableKg: billableKg(grams),
    freeThreshold: FREE_SHIPPING_THRESHOLD,
    freeRemaining: Math.max(0, FREE_SHIPPING_THRESHOLD - (Number(subtotal) || 0)),
    options,
  };
}

/**
 * Resolves the courier the customer picked, falling back to the cheapest
 * available option when the requested one does not serve the destination.
 */
export function resolveShipping({ province, methodKey, items = [], subtotal = 0, cod = false }) {
  const quote = quoteShipping({ province, items, subtotal, cod });
  const chosen =
    quote.options.find((o) => o.key === methodKey) ||
    quote.options.find((o) => o.key === DEFAULT_SHIPPING_METHOD) ||
    quote.options.slice().sort((a, b) => a.cost - b.cost)[0] ||
    null;
  return { quote, chosen };
}
