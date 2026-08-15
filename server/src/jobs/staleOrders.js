// ---------------------------------------------------------------------------
// Stale-order sweeper
//
// PROBLEM IT FIXES: POST /api/orders reserves stock immediately
// (`stockCommitted: true`). If the buyer closes the tab before reaching the
// gateway, the order can stay `unpaid`/`pending` and keep those units locked.
//
// This job finds orders that have been waiting longer than
// PENDING_ORDER_TTL_MINUTES (default 30), atomically marks them as failed,
// then releases their reserved stock.
//
// IMPORTANT:
// The order is first atomically claimed by changing paymentStatus from
// `unpaid`/`pending` to `failed`.
// This prevents a payment callback from racing with the sweeper and turning
// the same order into `paid` after its stock has already been released.
// ---------------------------------------------------------------------------

import Order from "../models/Order.js";
import Product from "../models/Product.js";

const TTL_MINUTES = Math.max(
  5,
  Number(process.env.PENDING_ORDER_TTL_MINUTES) || 30
);

const INTERVAL_MS = 10 * 60 * 1000; // run every 10 minutes
const BATCH = 100;

// ---------------------------------------------------------------------------
// Release reserved stock
// ---------------------------------------------------------------------------

export async function releaseOrderStock(order) {
  if (!order?.stockCommitted) return;

  await Promise.all(
    (order.items || []).map((item) =>
      Product.updateOne(
        { id: item.id },
        { $inc: { stock: item.qty } }
      )
    )
  );

  order.stockCommitted = false;
}

// ---------------------------------------------------------------------------
// Find and release stale orders
// ---------------------------------------------------------------------------

export async function sweepStaleOrders() {
  const cutoff = new Date(
    Date.now() - TTL_MINUTES * 60 * 1000
  );

  const stale = await Order.find({
    paymentStatus: {
      $in: ["unpaid", "pending"],
    },
    stockCommitted: true,
    createdAt: {
      $lt: cutoff,
    },
  })
    .sort({
      createdAt: 1,
    })
    .limit(BATCH);

  let released = 0;

  for (const order of stale) {
    try {
      // ---------------------------------------------------------------------
      // Atomically claim the stale order.
      //
      // If the payment callback has already changed paymentStatus,
      // findOneAndUpdate returns null.
      //
      // In that case we MUST NOT release stock.
      // ---------------------------------------------------------------------

      const claimed = await Order.findOneAndUpdate(
        {
          _id: order._id,

          paymentStatus: {
            $in: ["unpaid", "pending"],
          },

          stockCommitted: true,

          createdAt: {
            $lt: cutoff,
          },
        },
        {
          $set: {
            paymentStatus: "failed",
          },
        },
        {
          new: true,
        }
      );

      // Another process won the race.
      //
      // Most importantly:
      // DO NOT release stock here.
      if (!claimed) {
        continue;
      }

      // ---------------------------------------------------------------------
      // The order has now been atomically claimed by the stale-order worker.
      // Payment callback can no longer transition this order from
      // unpaid/pending to paid using the same state condition.
      // ---------------------------------------------------------------------

      await releaseOrderStock(claimed);

      // ---------------------------------------------------------------------
      // Persist that the stock reservation has been released.
      //
      // We only update the order if:
      // - it is still the same order
      // - paymentStatus is still failed
      // - stockCommitted is still true
      // ---------------------------------------------------------------------

      await Order.updateOne(
        {
          _id: claimed._id,

          paymentStatus: "failed",

          stockCommitted: true,
        },
        {
          $set: {
            stockCommitted: false,
          },
        }
      );

      released += 1;
    } catch (err) {
      console.error(
        "staleOrders: could not release",
        order.code,
        err?.message
      );
    }
  }

  if (released > 0) {
    console.log(
      `staleOrders: released reserved stock for ${released} order(s).`
    );
  }

  return released;
}

// ---------------------------------------------------------------------------
// Start stale-order sweeper
// ---------------------------------------------------------------------------

export function startStaleOrderSweeper() {
  // Run once shortly after boot.
  //
  // unref() prevents this timer from keeping the Node.js process alive
  // during graceful shutdown.
  setTimeout(() => {
    sweepStaleOrders().catch((error) => {
      console.error(
        "staleOrders:",
        error?.message
      );
    });
  }, 15_000).unref();

  // Then run every 10 minutes.
  const timer = setInterval(() => {
    sweepStaleOrders().catch((error) => {
      console.error(
        "staleOrders:",
        error?.message
      );
    });
  }, INTERVAL_MS);

  timer.unref();

  return timer;
}