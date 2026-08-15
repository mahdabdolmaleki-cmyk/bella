import mongoose from "mongoose";

/**
 * Page-view counter used by the admin dashboard charts.
 *
 * Design notes:
 *  - One document PER DAY (and per path bucket), not per request. A busy shop
 *    would otherwise write millions of rows just to draw a bar chart.
 *  - `$inc` with upsert is atomic, so concurrent requests cannot lose counts.
 *  - No IP, no user-agent, no user id is stored: this is a counter, not
 *    tracking. That keeps it safe to enable without a cookie banner.
 *  - A TTL index drops buckets automatically after VISIT_RETENTION_DAYS.
 */
export const VISIT_RETENTION_DAYS = Math.min(
  400,
  Math.max(30, Number(process.env.VISIT_RETENTION_DAYS) || 180),
);

const visitSchema = new mongoose.Schema({
  // Local calendar day in YYYY-MM-DD form (Tehran time), used for grouping.
  day: { type: String, required: true, maxlength: 10 },
  // "home" | "shop" | "product" | "other"
  bucket: { type: String, default: "other", maxlength: 20 },
  // Numeric product id when bucket === "product", else null.
  product: { type: Number, default: null },
  count: { type: Number, default: 0 },
  // Timestamp of the bucket's day — used for the TTL index and for sorting.
  at: { type: Date, required: true },
});

visitSchema.index({ day: 1, bucket: 1, product: 1 }, { unique: true });
visitSchema.index({ at: 1 }, { expireAfterSeconds: VISIT_RETENTION_DAYS * 86400 });

const Visit = mongoose.model("Visit", visitSchema);
export default Visit;
