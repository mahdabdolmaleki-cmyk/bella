import mongoose from "mongoose";
import { nextSequence } from "./Counter.js";
import User from "./User.js";

export const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed", "refunded"];

export const ORDER_STATUSES = [
  "\u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0623\u06cc\u06cc\u062f",
  "\u062f\u0631 \u062d\u0627\u0644 \u0622\u0645\u0627\u062f\u0647\u200c\u0633\u0627\u0632\u06cc",
  "\u0627\u0631\u0633\u0627\u0644 \u0634\u062f",
  "\u062a\u062d\u0648\u06cc\u0644 \u062f\u0627\u062f\u0647 \u0634\u062f",
  "\u0644\u063a\u0648 \u0634\u062f",
];

const orderItemSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    name: { type: String, required: true, maxlength: 120 },
    qty: { type: Number, required: true, min: 1, max: 99 },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: null },
    // Snapshot of the campaign state at purchase time so every invoice
    // (customer + admin) can show «جشنواره/تخفیف» and the per-line discount
    // even if the product is later removed from the campaign.
    oldPrice: { type: Number, default: null },
    festival: { type: Boolean, default: false },
    discount: { type: Boolean, default: false },
    // امتیاز وفاداری این قلم در لحظهٔ خرید (برای اهدای ستاره پس از نشست).
    points: { type: Number, default: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // `unique: true` already creates the index — the extra `index: true` made
    // Mongoose build the same index twice and log a duplicate-index warning.
    id: { type: Number, unique: true },
    code: { type: String, required: true, unique: true, maxlength: 32 },
    customerName: { type: String, required: true, maxlength: 80, trim: true },
    phone: { type: String, required: true, maxlength: 20, trim: true },
    // Used for the order receipt / shipping notifications. Optional for guests
    // who only leave a phone number.
    email: { type: String, default: "", maxlength: 160, lowercase: true, trim: true },
    province: { type: String, default: "", maxlength: 40, trim: true },
    city: { type: String, default: "", maxlength: 60, trim: true },
    // Iranian postal code (10 digits) — couriers refuse a parcel without it.
    postalCode: { type: String, default: "", maxlength: 10, trim: true },
    address: { type: String, required: true, maxlength: 500, trim: true },
    note: { type: String, default: "", maxlength: 500 },
    items: { type: [orderItemSchema], default: [] },

    // ---- Money ------------------------------------------------------------
    // `total` = subtotal + shippingCost. Keeping the parts lets the invoice,
    // the account page and the admin panel all show the same breakdown
    // instead of re-deriving it (and disagreeing).
    subtotal: { type: Number, default: 0, min: 0 },
    shippingCost: { type: Number, default: 0, min: 0 },
    shippingMethod: { type: String, default: "", maxlength: 30 },
    shippingLabel: { type: String, default: "", maxlength: 60 },
    shippingZone: { type: String, default: "", maxlength: 20 },
    shippingWeightGrams: { type: Number, default: 0, min: 0 },
    shippingEtaDays: { type: Number, default: 0, min: 0 },
    freeShipping: { type: Boolean, default: false },
    // Courier barcode filled in by the admin once the parcel is handed over.
    trackingCode: { type: String, default: "", maxlength: 60, trim: true },

    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: ORDER_STATUSES[0] },
    // Append-only audit trail of every status change, so the customer-facing
    // tracker can show WHEN each step happened instead of only the last one.
    timeline: {
      type: [
        {
          status: { type: String, enum: ORDER_STATUSES, required: true },
          at: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      default: [],
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

    // ---- Payment (ZarinPal) ------------------------------------------------
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "unpaid", index: true },
    // ---- تخفیف خرید اول (v35) / کد تخفیف (v40) ----
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0, min: 0 },
    // کد تخفیفی که واقعاً روی این سفارش اعمال شده (وگرنه "" خالی).
    couponCode: { type: String, default: "", maxlength: 24, trim: true },
    // v42: چرا پرداخت انجام نشد؟ expired=sweeper | declined=درگاه | canceled=لغو در درگاه
    paymentFailReason: {
      type: String,
      default: "",
      enum: ["", "expired", "declined", "canceled"],
      maxlength: 12,
    },
    couponFixed: { type: Number, default: 0, min: 0 }, // v41: مبلغ تومانِ کد تخفیفِ مبلغی
    // کلید یکتای «کوپن:شماره» تا دو سفارشِ هم‌زمان با یک کدِ یک‌بارمصرف با خطای
    // یکتایی (11000) رد شوند. sparse: سفارشِ بدون کوپن این فیلد را ندارد.
    couponUseKey: { type: String, maxlength: 80, unique: true, sparse: true },
    // true یعنی کرایه درِ منزل (پس‌کرایه) پرداخت می‌شود؛ آنلاین فقط کالا.
    shippingCod: { type: Boolean, default: false },
    // ---- باکس ویژه (VIP) ----
    vipBox: { type: Boolean, default: false },
    vipBoxFee: { type: Number, default: 0, min: 0 },
    // وفاداری ستاره‌ای (v42): سطح ستارهٔ مشتری در لحظهٔ خرید + هدیهٔ دکانت.
    starLevel: { type: Number, default: 0, min: 0 },
    starGift: { type: Boolean, default: false },
    // کدام مزایای ستاره روی این سفارش اعمال شد + منبع هرکدام (ستارهٔ چندم)،
    // تا در فاکتور دقیقاً نوشته شود «مثلاً باکس VIP رایگان — از مزایای ستارهٔ ۲».
    starPerksApplied: {
      type: [{ key: String, star: Number, title: String }],
      default: [],
    },
    // منبعِ تخفیفِ اعمال‌شده: none | coupon | first | star
    discountSource: { type: String, default: "none" },
    // اهدای امتیاز هنگام ثبت سفارش فقط یک‌بار انجام می‌شود؛ مقدارِ اهداشده
    // نگه داشته می‌شود تا هنگام لغو، دقیقاً همان مقدار بازپس گرفته شود.
    pointsAwarded: { type: Boolean, default: false },
    pointsAwardedAmount: { type: Number, default: 0 },
    pointsRevoked: { type: Boolean, default: false },
    // درخواست لغو از سمت مشتری (v35) — ادمین در پنل می‌بیند و پاک می‌کند.
    cancelRequested: { type: Boolean, default: false },
    cancelRequestedAt: { type: Date, default: null },
    // وقتی سفارش لغو می‌شود، ادمین می‌تواند آن را از گزارش فروش حذف کند (v36)
    excludeFromSales: { type: Boolean, default: false, index: true },
    paymentMethod: { type: String, default: "online", maxlength: 20 },
    // Gateway transaction handle; unique per order, sparse so unpaid orders
    // do not collide on null.
    authority: { type: String, default: null, maxlength: 100, index: true, sparse: true },
    // همهٔ authorityهای صادرشده برای این سفارش (اگر مشتری چند بار /start بزند)،
    // تا پرداخت با authority قدیمی‌تر هم در callback به سفارش برسد.
    authorities: { type: [String], default: [] },
    refId: { type: String, default: null, maxlength: 60 },
    cardPan: { type: String, default: null, maxlength: 30 },
    paidAt: { type: Date, default: null },
    // Set once the stock has been decremented, so a retry never double-books.
    stockCommitted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.pre("save", async function () {
  if (this.id == null) this.id = await nextSequence("order");
  // Keep the timeline in sync with `status` no matter which code path changed
  // it (admin panel, payment callback, stale-order sweeper...).
  const last = this.timeline?.[this.timeline.length - 1];
  if (!last || last.status !== this.status) {
    this.timeline.push({ status: this.status, at: new Date() });
  }
});

orderSchema.methods.toDTO = function () {
  return {
    id: this.id,
    code: this.code,
    customerName: this.customerName,
    phone: this.phone,
    email: this.email || "",
    province: this.province || "",
    city: this.city || "",
    postalCode: this.postalCode || "",
    address: this.address,
    note: this.note || "",
    items: this.items.map((i) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      price: i.price,
      image: i.image ?? null,
      oldPrice: i.oldPrice ?? null,
      festival: i.festival === true,
      discount: i.discount === true,
      points: i.points ?? 0,
    })),
    subtotal: this.subtotal ?? Math.max(0, this.total - (this.shippingCost || 0)),
    discountPercent: this.discountPercent ?? 0,
    discountAmount: this.discountAmount ?? 0,
    couponCode: this.couponCode || "",
    paymentFailReason: this.paymentFailReason || "",
    couponPercent: this.couponCode ? this.discountPercent ?? 0 : 0,
    couponFixed: this.couponCode ? this.couponFixed ?? 0 : 0,
    shippingCod: Boolean(this.shippingCod),
    vipBox: Boolean(this.vipBox),
    vipBoxFee: this.vipBoxFee ?? 0,
    starLevel: this.starLevel ?? 0,
    starGift: this.starGift === true,
    starPerksApplied: (this.starPerksApplied || []).map((p) => ({
      key: p.key,
      star: p.star ?? 0,
      title: p.title || "",
    })),
    discountSource: this.discountSource || "none",
    cancelRequested: Boolean(this.cancelRequested),
    cancelRequestedAt: this.cancelRequestedAt ?? null,
    excludeFromSales: Boolean(this.excludeFromSales),
    shippingCost: this.shippingCost || 0,
    shippingMethod: this.shippingMethod || "",
    shippingLabel: this.shippingLabel || "",
    shippingEtaDays: this.shippingEtaDays || 0,
    freeShipping: Boolean(this.freeShipping),
    trackingCode: this.trackingCode || "",
    total: this.total,
    // v39: مبلغی که واقعاً آنلاین پرداخت می‌شود (با پس‌کرایه، کرایه کم می‌شود).
    onlinePaid: this.onlinePayable(),
    status: this.status,
    timeline: (this.timeline || []).map((t) => ({ status: t.status, at: t.at })),
    paymentStatus: this.paymentStatus,
    paymentMethod: this.paymentMethod,
    refId: this.refId ?? null,
    paidAt: this.paidAt ?? null,
    createdAt: this.createdAt,
  };
};

// PERF: the admin lists always run `.sort({ createdAt: -1 }).limit(...)`, which
// without an index means a full collection scan plus an in-memory sort.
orderSchema.index({ createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });
// Used by the stale-order sweeper (jobs/staleOrders.js).
/** مبلغی که باید آنلاین پرداخت شود — با پس‌کرایه، کرایه از آن کم می‌شود. */
orderSchema.methods.onlinePayable = function onlinePayable() {
  const shipping = this.shippingCod ? Number(this.shippingCost || 0) : 0;
  return Math.max(0, Number(this.total || 0) - shipping);
};

orderSchema.index({ paymentStatus: 1, stockCommitted: 1, createdAt: 1 });

// وضعیت «لغو شد» — تنها وضعیتی که امتیازِ اهداشده را بازپس می‌گیرد.
export const CANCELLED_STATUS = ORDER_STATUSES[ORDER_STATUSES.length - 1];

/**
 * اهدای یک‌بارهٔ امتیاز وفاداری — همان لحظهٔ ثبت سفارش.
 *
 * سفارش با وضعیت «در انتظار تأیید» ساخته می‌شود، پس قلاب post("save") در اولین
 * ذخیره (یعنی ثبت سفارش) امتیاز را می‌دهد؛ لازم نیست صبر کنیم تا پرداخت شود.
 *
 * idempotent: با claim اتمیکِ pointsAwarded فقط یک‌بار داده می‌شود و مقدارِ
 * اهداشده در pointsAwardedAmount ثبت می‌شود تا هنگام لغو دقیقاً همان مقدار کم
 * شود. سفارشِ لغوشده امتیاز نمی‌گیرد.
 *
 * @returns {Promise<number>} امتیازی که واقعاً اضافه شد (۰ اگر داده نشد).
 */
export async function awardOrderPoints(order) {
  try {
    if (!order?._id || !order.user) return 0;
    if (order.pointsAwarded || order.pointsRevoked) return 0;
    if (order.status === CANCELLED_STATUS) return 0;
    const pts = (order.items || []).reduce((s, i) => s + (i.points || 0) * (i.qty || 0), 0);
    // claim اتمیک: فقط یک مسیر می‌تواند pointsAwarded را false→true ببرد.
    const claimed = await Order.updateOne(
      { _id: order._id, pointsAwarded: { $ne: true }, pointsRevoked: { $ne: true } },
      { $set: { pointsAwarded: true, pointsAwardedAmount: pts } }
    );
    if (claimed.modifiedCount !== 1) return 0;
    if (pts > 0) await User.updateOne({ _id: order.user }, { $inc: { points: pts } });
    return pts;
  } catch {
    /* خطای اهدای امتیاز نباید ثبت سفارش را خراب کند */
    return 0;
  }
}

/**
 * بازپس‌گیری امتیاز هنگام لغو سفارش — دقیقاً همان مقدارِ اهداشده
 * (pointsAwardedAmount) از مشتری کم می‌شود. idempotent با پرچم pointsRevoked،
 * پس لغوِ دوبار یا saveهای بعدی امتیاز را دوبار کم نمی‌کنند.
 *
 * @returns {Promise<number>} امتیازی که واقعاً کم شد (۰ اگر کم نشد).
 */
export async function revokeOrderPoints(order) {
  try {
    if (!order?._id) return 0;
    if (order.status !== CANCELLED_STATUS) return 0;
    // claim اتمیک از روی وضعیتِ واقعیِ DB (نه فیلدهای ممکن‌است‌کهنهٔ حافظه) و
    // خواندن مقدارِ اهداشدهٔ واقعی برای کسرِ دقیق. new:false سندِ قبل از
    // به‌روزرسانی را می‌دهد که pointsAwardedAmount درست دارد.
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, pointsAwarded: true, pointsRevoked: { $ne: true } },
      { $set: { pointsRevoked: true } },
      { new: false }
    );
    if (!claimed) return 0;
    const pts = Number(claimed.pointsAwardedAmount) || 0;
    if (pts > 0 && claimed.user) await User.updateOne({ _id: claimed.user }, { $inc: { points: -pts } });
    return pts;
  } catch {
    /* خطای بازپس‌گیری نباید لغو سفارش را خراب کند */
    return 0;
  }
}

// قلاب save — ثبت سفارش یا تغییر وضعیت آن. اگر وضعیت «لغو شد» شد امتیاز را
// بازپس می‌گیرد، وگرنه (اولین ثبت = در انتظار تأیید) امتیاز می‌دهد.
// مهم: این قلاب باید پیش از mongoose.model() ثبت شود تا روی مدل اعمال شود.
orderSchema.post("save", async function (doc) {
  if (doc.status === CANCELLED_STATUS) await revokeOrderPoints(doc);
  else await awardOrderPoints(doc);
});

const Order = mongoose.model("Order", orderSchema);

export default Order;
