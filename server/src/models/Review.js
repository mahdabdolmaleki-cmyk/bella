import mongoose from "mongoose";
import { nextSequence } from "./Counter.js";

/**
 * Product review / نقد و بررسی.
 *
 * A review always stores the display name and (optionally) the account that
 * wrote it. Guests can review too, so `user` may be null.
 *
 * Moderation: every review starts as `pending` and is invisible on the
 * storefront until an admin approves it. This is deliberate — an open review
 * form is the easiest spam vector on a shop.
 *
 * The admin answer lives on the same document (`reply`), which keeps the public
 * endpoint a single query with no joins.
 */
export const REVIEW_STATUSES = ["pending", "approved", "rejected"];

const reviewSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true },
    // Numeric public product id (Product.id), not the ObjectId.
    product: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    body: { type: String, required: true, trim: true, maxlength: 1500 },
    status: { type: String, enum: REVIEW_STATUSES, default: "pending", index: true },
    // Whether the reviewer actually bought this product (badge on the storefront).
    verifiedBuyer: { type: Boolean, default: false },
    // Admin answer shown indented under the review.
    reply: {
      body: { type: String, default: "", maxlength: 1500 },
      author: { type: String, default: "", maxlength: 80 },
      at: { type: Date, default: null },
    },
    // Kept for abuse investigation only, never returned to the storefront.
    ip: { type: String, default: "", maxlength: 60, select: false },
  },
  { timestamps: true },
);

// Newest-first listing per product, and the moderation queue.
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });

reviewSchema.pre("save", async function () {
  if (this.id == null) this.id = await nextSequence("review");
});

// PUBLIC DTO — no IP, no e-mail, no account id.
reviewSchema.methods.toDTO = function () {
  return {
    id: this.id,
    product: this.product,
    name: this.name,
    rating: this.rating,
    body: this.body,
    verifiedBuyer: Boolean(this.verifiedBuyer),
    createdAt: this.createdAt,
    reply: this.reply?.body
      ? { body: this.reply.body, author: this.reply.author || "مدیر سایت", at: this.reply.at }
      : null,
  };
};

// ADMIN DTO — adds the moderation fields.
reviewSchema.methods.toAdminDTO = function () {
  return {
    ...this.toDTO(),
    status: this.status,
    userId: this.user ? String(this.user) : null,
  };
};

const Review = mongoose.model("Review", reviewSchema);
export default Review;
