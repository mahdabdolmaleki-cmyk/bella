import type { ProductDTO } from "./data";

// Shared domain types for the storefront + admin panel. These mirror the JSON
// shapes returned by the Express API.
export type Product = ProductDTO;

// نمادها و متن‌های ویژهٔ صفحهٔ محصول (آیکن + متن کوتاه).
export type { ProductHighlight } from "./data";

// Admin-only view of a product: includes the inventory fields that are never
// sent to customers.
export type AdminProduct = ProductDTO & {
  stock: number;
  allowBackorder: boolean;
};

export type OrderItem = {
  id: number;
  name: string;
  qty: number;
  price: number;
  image?: string | null;
};

/** One entry of the customer-facing order tracker. */
export type OrderTimelineEntry = {
  status: string;
  at: string | Date;
};

export type Order = {
  id: number;
  code: string;
  customerName: string;
  phone: string;
  email?: string;
  province?: string;
  city?: string;
  postalCode?: string;
  address: string;
  note?: string;
  items: OrderItem[];
  /** Goods only, before shipping. */
  subtotal?: number;
  /** تخفیف خرید اول (درصد و مبلغ). */
  discountPercent?: number;
  discountAmount?: number;
  /** کد تخفیف اعمال‌شده روی همین سفارش (v40). */
  couponCode?: string;
  couponFixed?: number;
  /** پس‌کرایه: کرایه درِ منزل پرداخت می‌شود. */
  shippingCod?: boolean;
  /** باکس ویژه VIP. */
  vipBox?: boolean;
  vipBoxFee?: number;
  /** درخواست لغو از سمت مشتری. */
  cancelRequested?: boolean;
  cancelRequestedAt?: string | Date | null;
  /** حذف از گزارش فروش (v36) */
  excludeFromSales?: boolean;
  shippingCost?: number;
  shippingMethod?: string;
  shippingLabel?: string;
  shippingEtaDays?: number;
  freeShipping?: boolean;
  trackingCode?: string;
  total: number;
  status: string;
  timeline?: OrderTimelineEntry[];
  paymentStatus?: "unpaid" | "pending" | "paid" | "failed" | "refunded";
  paymentMethod?: string;
  refId?: string | null;
  paidAt?: string | Date | null;
  createdAt: string | Date;
};

export type Message = {
  id: number;
  name: string;
  phone: string;
  body: string;
  createdAt: string | Date;
};

/* ------------------------------------------------------------------ */
/*  ارسال و پست                                                        */
/* ------------------------------------------------------------------ */

/** A single courier quote returned by POST /api/shipping/quote. */
export type ShippingOption = {
  key: string;
  label: string;
  /** Icon file name in /public/icons (see lib/icons.ts). */
  icon: string;
  desc: string;
  /** این روش ارسال پس‌کرایه (پرداخت کرایه درِ منزل) دارد. */
  codSupported?: boolean;
  /** What the customer actually pays (0 when free shipping applies). */
  cost: number;
  /** Undiscounted price, shown struck through when the order ships free. */
  listPrice: number;
  free: boolean;
  insurance: number;
  codFee: number;
  weightGrams: number;
  billableKg: number;
  etaDays?: { min: number; max: number };
  showEta?: boolean;
  etaText?: string;
};

export type ShippingQuote = {
  province: string;
  subtotal: number;
  /** تخفیف خرید اول — فقط برای نمایش در فاکتور سبد. */
  firstPurchaseDiscount?: { percent: number; amount: number } | null;
  /** v40: تخفیف برتر (کد یا خرید اول) — همان چیزی که سرور اعمال می‌کند. */
  discount?: { source: "first" | "coupon"; percent: number; amount: number; fixed?: number; code: string } | null;
  coupon?: {
    input: string;
    applied: { code: string; percent: number; amount: number; fixed?: number; until?: string } | null;
    error: string;
  } | null;
  weightGrams: number;
  billableKg: number;
  freeThreshold: number;
  freeRemaining: number;
  showEta?: boolean;
  options: ShippingOption[];
};

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  phoneVerified?: boolean;
  address: string;
  // Saved default destination, used to pre-fill checkout.
  province?: string;
  city?: string;
  postalCode?: string;
  // Product ids saved in "علاقه‌مندی‌ها".
  favorites?: number[];
};

export type Customer = User & {
  createdAt: string | Date;
  orderCount: number;
  totalSpent: number;
};

/* ------------------------------------------------------------------ */
/*  نقد و بررسی‌ها                                                    */
/* ------------------------------------------------------------------ */
export type ReviewStatus = "pending" | "approved" | "rejected";

export type ReviewReply = {
  body: string;
  author: string;
  at: string | Date | null;
};

export type Review = {
  id: number;
  product: number;
  name: string;
  rating: number;
  body: string;
  verifiedBuyer: boolean;
  reply: ReviewReply | null;
  createdAt: string | Date;
};

// Public product page payload: the approved list plus the rating histogram.
export type ReviewSummary = {
  reviews: Review[];
  total: number;
  average: number;
  count: number;
  breakdown: Record<number, number>;
};

// Moderation view: adds the workflow status and the product name.
export type AdminReview = Review & {
  status: ReviewStatus;
  productName: string;
  userId?: string | null;
};

/* ------------------------------------------------------------------ */
/*  آمار داشبورد                                                     */
/* ------------------------------------------------------------------ */
export type StatsBucket = {
  key: string;
  revenue: number;
  orders: number;
  visits: number;
};

export type StatsResponse = {
  range: "daily" | "weekly" | "monthly";
  timezone: string;
  series: StatsBucket[];
  totals: {
    products: number;
    orders: number;
    customers: number;
    pendingReviews: number;
    revenue: number;
    rangeRevenue: number;
    rangeOrders: number;
    rangeVisits: number;
  };
};

export type StatusCounts = {
  byStatus: Array<{ status: string; count: number }>;
  byPayment: Array<{ status: string; count: number }>;
};

/* ------------------------------------------------------------------ */
/*  باشگاه مشتریان (امتیاز و سطح عضویت)                              */
/* ------------------------------------------------------------------ */
export type TierKey = "regular" | "gold" | "diamond";

export type TierInfo = {
  key: TierKey;
  label: string;
  icon: string;
  color: string;
};

export type LoyaltyInfo = {
  points: number;
  tier: TierKey;
  tiers: TierInfo[];
  totalSpent: number;
  orders: number;
  tomanPerPoint: number;
  thresholds: { gold: number; diamond: number };
  next: { tier: TierKey; at: number; remaining: number; progress: number } | null;
};
