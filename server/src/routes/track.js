import { Router } from "express";
import Visit from "../models/Visit.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { str, int } from "../utils/validate.js";

const router = Router();

const BUCKETS = new Set(["home", "shop", "product", "account", "other"]);

/** Local (Tehran) calendar day key, so the charts match the shop's own clock. */
export function dayKey(date = new Date(), timeZone = "Asia/Tehran") {
  // en-CA gives YYYY-MM-DD directly.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * POST /api/track/visit  { bucket, product? }
 *
 * Increments one daily counter. Returns 204 with no body: the storefront fires
 * this and forgets about it, so there is nothing to parse and nothing to leak.
 * A failure here must NEVER affect the visitor, so errors are swallowed.
 */
router.post(
  "/visit",
  rateLimit({ name: "track-visit", windowMs: 60 * 1000, max: 60 }),
  ah(async (req, res) => {
    const raw = str(req.body?.bucket, { max: 20 });
    const bucket = BUCKETS.has(raw) ? raw : "other";
    const product =
      bucket === "product" ? int(req.body?.product, { min: 1, max: 1e9, fallback: null }) : null;

    const day = dayKey();
    // Midday UTC of that day: safe anchor for the TTL index regardless of zone.
    const at = new Date(`${day}T12:00:00.000Z`);

    try {
      await Visit.updateOne(
        { day, bucket, product },
        { $inc: { count: 1 }, $setOnInsert: { day, bucket, product, at } },
        { upsert: true }
      );
    } catch {
      // A duplicate-key race or a database hiccup must not break page loads.
    }

    res.status(204).end();
  })
);

export default router;
