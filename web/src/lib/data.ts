export type ProductDTO = {
  id: number;
  name: string;
  nameEn: string;
  tagline: string;
  description: string;
  topNotes: string;
  heartNotes: string;
  baseNotes: string;
  longevity: string;
  sillage: string;
  price: number;
  oldPrice: number | null;
  sizeMl: number;
  glass: string;
  liquid: string;
  category: string;
  badge: string | null;
  bestseller: boolean;
  active: boolean;
  image: string | null;
  // Availability flag only — the real stock number is admin-only.
  inStock?: boolean;
  // Specification sheet rendered in the "ویژگی‌های محصول" tab. Every row is
  // optional and hidden when empty.
  brand?: string;
  manufacturer?: string;
  suitableFor?: string;
  concentration?: string;
  originCountry?: string;
  madeIn?: string;
  scentType?: string;
  scentStructure?: string;
  season?: string;
  // Long body of the "توضیحات" tab plus extra photos.
  longDescription?: string;
  gallery?: string[];
};

// NOTE: the old SEED_PRODUCTS constant lived here. It duplicated the real
// catalogue (server/src/seed.js), was never imported anywhere, and shipped
// ~130 lines of stale product data to every browser. Removed.

export const formatToman = (n: number) =>
  n.toLocaleString("fa-IR") + " تومان";

export const toFa = (n: number | string) =>
  String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
