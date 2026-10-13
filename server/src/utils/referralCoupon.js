import ReferralCode from "../models/ReferralCode.js";

/**
 * Resolve a one-use referral discount for the signed-in owner only.
 * Regular coupons are resolved separately; this helper is shared by the cart
 * preview and final order creation so owner/used/expiry checks cannot drift.
 */
export async function findOwnedReferralCoupon(rawCode, ownerId) {
  const code = String(rawCode ?? "").trim().toUpperCase().slice(0, 24);
  if (!code) return { reason: "notfound" };

  const referral = ownerId
    ? await ReferralCode.findOne({ code, owner: ownerId })
    : null;

  if (referral) {
    if (referral.used) return { reason: "used" };
    if (referral.expiresAt && new Date(referral.expiresAt).getTime() <= Date.now()) {
      return { reason: "expired" };
    }

    return {
      coupon: {
        code: referral.code,
        percent: Number(referral.percent) || 0,
        amount: Number(referral.amount) || 0,
        minOrder: 0,
        maxUses: 0,
        until: "",
      },
      referralId: referral._id,
      referralCode: referral.code,
    };
  }

  // Do not reveal any referral-code state to another account, but give the
  // signed-in customer a useful ownership error rather than a false 404.
  const other = await ReferralCode.findOne({ code }).select("_id").lean();
  return { reason: other ? "belongs-to-another" : "notfound" };
}

export function referralCouponError(reason) {
  if (reason === "used") return "این کد یک‌بارمصرف قبلاً استفاده شده است.";
  if (reason === "expired") return "مهلت این کد تخفیف تمام شده است.";
  if (reason === "belongs-to-another") return "این کد متعلق به حساب شما نیست.";
  return "";
}
