import mongoose from "mongoose";
import { nextSequence } from "./Counter.js";

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
    paymentMethod: { type: String, default: "online", maxlength: 20 },
    // Gateway transaction handle; unique per order, sparse so unpaid orders
    // do not collide on null.
    authority: { type: String, default: null, maxlength: 100, index: true, sparse: true },
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
    })),
    subtotal: this.subtotal ?? Math.max(0, this.total - (this.shippingCost || 0)),
    shippingCost: this.shippingCost || 0,
    shippingMethod: this.shippingMethod || "",
    shippingLabel: this.shippingLabel || "",
    shippingEtaDays: this.shippingEtaDays || 0,
    freeShipping: Boolean(this.freeShipping),
    trackingCode: this.trackingCode || "",
    total: this.total,
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
orderSchema.index({ paymentStatus: 1, stockCommitted: 1, createdAt: 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;
