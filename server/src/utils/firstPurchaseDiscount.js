import Order, { CANCELLED_STATUS } from "../models/Order.js";

/**
 * Returns whether a customer has an existing order that blocks the
 * first-purchase offer. Normal failed/cancelled orders do not consume the offer,
 * but an order that actually recorded `discountSource: "first"` does: that
 * durable order field remains the source of truth even after stale-order cleanup
 * or a server restart changes its payment/status fields.
 */
export async function hasPreviousFirstPurchaseOrder(phone, userId) {
  const identities = [];
  if (phone) identities.push({ phone });
  if (userId) identities.push({ user: userId });
  if (identities.length === 0) return false;

  const previous = await Order.exists({
    $and: [
      { $or: identities },
      {
        $or: [
          { discountSource: "first" },
          {
            status: { $ne: CANCELLED_STATUS },
            paymentStatus: { $ne: "failed" },
          },
        ],
      },
    ],
  });

  return Boolean(previous);
}
