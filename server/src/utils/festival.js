// Fields changed when a product joins a festival campaign. Keep a private,
// one-time snapshot so expiry/removal restores any pre-existing discount/tag.
export function captureFestivalSnapshot(product) {
  if (product.festivalSnapshot) return product.festivalSnapshot;
  const snapshot = {
    oldPrice: product.oldPrice ?? null,
    badge: product.badge ?? null,
    discount: product.discount === true,
    discountType: product.discountType || "",
    discountValue: product.discountValue ?? null,
  };
  product.festivalSnapshot = snapshot;
  return snapshot;
}

/** Values to restore; legacy festival products without a snapshot are cleared. */
export function syncNonFestivalEdits(product) {
  const snapshot = product?.festivalSnapshot;
  if (!product?.festival || !snapshot) return false;
  snapshot.oldPrice = product.oldPrice ?? null;
  snapshot.badge = product.badge ?? null;
  snapshot.discount = product.discount === true;
  snapshot.discountType = product.discountType || "";
  snapshot.discountValue = product.discountValue ?? null;
  return true;
}

export function festivalFieldsToRestore(snapshot) {
  const value = snapshot?.toObject ? snapshot.toObject() : snapshot;
  if (!value) {
    return {
      oldPrice: null,
      badge: null,
      discount: false,
      discountType: "",
      discountValue: null,
    };
  }
  return {
    oldPrice: value.oldPrice ?? null,
    badge: value.badge ?? null,
    discount: value.discount === true,
    discountType: ["percent", "amount"].includes(value.discountType) ? value.discountType : "",
    discountValue: value.discountValue ?? null,
  };
}
