// ---------------------------------------------------------------------------
// Stale-order sweeper
//
// PROBLEM IT FIXES: POST /api/orders reserves stock immediately
// (`stockCommitted: true`). If the buyer closed the tab before reaching the
// gateway, the order stayed `unpaid`/`pending` forever and those units were
// locked out of the shop permanently.
//
// This job releases the reservation for orders that have been waiting longer
// than PENDING_ORDER_TTL_MINUTES (default 30) and marks them as failed.
// ---------------------------------------------------------------------------
import Order from "../models/Order.js";
import Product from "../models/Product.js";

const TTL_MINUTES = Math.max(5, Number(process.env.PENDING_ORDER_TTL_MINUTES) || 30);
const INTERVAL_MS = 10 * 60 * 1000; // run every 10 minutes
const BATCH = 100;

export async function releaseOrderStock(order) {
  if (!order?.stockCommitted) return;
  await Promise.all(
    (order.items || []).map((i) =>
      Product.updateOne({ id: i.id }, { $inc: { stock: i.qty } }).catch(() => {})
    )
  );
  order.stockCommitted = false;
}

export async function sweepStaleOrders() {
  const cutoff = new Date(Date.now() - TTL_MINUTES * 60 * 1000);
  const stale = await Order.find({
    paymentStatus: { $in: ["unpaid", "pending"] },
    stockCommitted: true,
    createdAt: { $lt: cutoff },
  })
    .sort({ createdAt: 1 })
    .limit(BATCH);

  let released = 0;
  for (const order of stale) {
    try {
      await releaseOrderStock(order);
      order.paymentStatus = "failed";
      await order.save();
      released += 1;
    } catch (err) {
      console.error("staleOrders: could not release", order.code, err?.message);
    }
  }
  if (released > 0) {
    console.log(`staleOrders: released reserved stock for ${released} order(s).`);
  }
  return released;
}

export function startStaleOrderSweeper() {
  // Run once shortly after boot, then on an interval. `unref()` keeps the timer
  // from holding the process open during a graceful shutdown.
  setTimeout(() => {
    sweepStaleOrders().catch((e) => console.error("staleOrders:", e?.message));
  }, 15_000).unref();

  const timer = setInterval(() => {
    sweepStaleOrders().catch((e) => console.error("staleOrders:", e?.message));
  }, INTERVAL_MS);
  timer.unref();
  return timer;
}
