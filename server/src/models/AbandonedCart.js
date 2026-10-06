import mongoose from "mongoose";

const abandonedItemSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    name: { type: String, required: true, maxlength: 120 },
    qty: { type: Number, required: true, min: 1, max: 99 },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: null },
  },
  { _id: false }
);

const abandonedCartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    phone: { type: String, default: "", maxlength: 20, index: true },
    email: { type: String, default: "", maxlength: 160 },
    name: { type: String, default: "", maxlength: 80 },
    items: { type: [abandonedItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
    // آخرین باری که سبد تغییر کرد
    lastUpdated: { type: Date, default: Date.now, index: true },
    // پیامک‌ها
    firstSent: { type: Boolean, default: false },
    firstSentAt: { type: Date, default: null },
    secondSent: { type: Boolean, default: false },
    secondSentAt: { type: Date, default: null },
    // وقتی سفارش ثبت شد، تبدیل شده محسوب می‌شود
    converted: { type: Boolean, default: false },
    convertedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

abandonedCartSchema.index({ lastUpdated: 1, converted: 1 });
abandonedCartSchema.index({ user: 1, converted: 1 });

const AbandonedCart = mongoose.model("AbandonedCart", abandonedCartSchema);
export default AbandonedCart;
