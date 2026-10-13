// End-to-end coverage for first-purchase discounts in settings, checkout quotes,
// order creation, and competition with coupon/loyalty discounts.
import {
  group,
  test,
  api,
  ADMIN,
  mkUser,
  mkProduct,
  orderBody,
  assert,
  M,
  sign,
} from "../harness.mjs";
import { clearSettingsCache } from "../../src/models/Settings.js";

export async function register() {
  const { Settings, User } = M();
  clearSettingsCache();
  const current = await Settings.getSingleton();
  const keys = [
    "firstPurchaseDiscountEnabled",
    "firstPurchaseDiscountType",
    "firstPurchasePercent",
    "firstPurchaseAmount",
    "couponEnabled",
    "couponCodesJson",
    "starsConfigJson",
    "vipBoxEnabled",
    "shippingFreeThreshold",
  ];
  const original = Object.fromEntries(
    keys.map((key) => [
      key,
      current[key] ??
        ({
          firstPurchaseDiscountEnabled: "",
          firstPurchaseDiscountType: "percent",
          firstPurchasePercent: "25",
          firstPurchaseAmount: "0",
          couponEnabled: "",
          couponCodesJson: "[]",
          starsConfigJson: "",
          vipBoxEnabled: "",
          shippingFreeThreshold: 5000000,
        }[key]),
    ]),
  );

  const saveSettings = async (patch) => {
    // Go through the actual admin endpoint so the running API invalidates its
    // own settings cache just like a real campaign change in the admin panel.
    const result = await api("/admin/settings", {
      method: "PUT",
      cookie: ADMIN,
      body: patch,
    });
    assert.status(result, 200, "settings update");
    clearSettingsCache();
  };
  const withSettings = async (patch, run) => {
    const base = {
      firstPurchaseDiscountEnabled: "1",
      firstPurchaseDiscountType: "percent",
      firstPurchasePercent: "25",
      firstPurchaseAmount: "0",
      couponEnabled: "",
      couponCodesJson: "[]",
      starsConfigJson: "[]",
      vipBoxEnabled: "",
      shippingFreeThreshold: 1000000000,
      ...patch,
    };
    await saveSettings(base);
    try {
      return await run();
    } finally {
      await saveSettings(original);
    }
  };

  const product = await mkProduct({
    name: "تست تخفیف خرید اول",
    price: 1000000,
    stock: 100,
    points: 0,
    discount: false,
    festival: false,
  });
  const quoteBuyer = await mkUser();
  const orderBuyer = await mkUser();
  const percentBuyer = await mkUser();
  const couponBuyer = await mkUser();
  const starBuyer = await User.create({
    name: "خریدار ستاره‌دار",
    phone: `09${String(Date.now()).slice(-9)}`,
    tokenVersion: 0,
    points: 10,
  });
  const starCookie = "bella_token=" + sign({ sub: String(starBuyer._id), tv: 0 });

  const quote = (buyer, cookie, couponCode = "") =>
    api("/shipping/quote", {
      method: "POST",
      ...(cookie ? { cookie } : {}),
      body: {
        province: "تهران",
        items: [{ id: product.id, qty: 1 }],
        phone: buyer.phone,
        ...(couponCode ? { couponCode } : {}),
      },
    });

  group("first-purchase-discount");
  test("fixed amount appears in checkout preview as Toman", async () =>
    withSettings(
      { firstPurchaseDiscountType: "amount", firstPurchaseAmount: "150000" },
      async () => {
        const r = await quote(quoteBuyer);
        assert.status(r, 200);
        assert.eq(r.j?.firstPurchaseDiscount?.percent, 0, "fixed preview percent");
        assert.eq(r.j?.firstPurchaseDiscount?.amount, 150000, "first discount amount");
        assert.eq(r.j?.firstPurchaseDiscount?.fixed, 150000, "fixed preview value");
        assert.eq(r.j?.discount?.source, "first", "winner source");
        assert.eq(r.j?.discount?.fixed, 150000, "winning discount is fixed");
      },
    ));

  test("fixed discount is capped at subtotal in checkout preview", async () =>
    withSettings(
      { firstPurchaseDiscountType: "amount", firstPurchaseAmount: "2000000" },
      async () => {
        const r = await quote(await mkUser());
        assert.status(r, 200);
        assert.eq(r.j?.firstPurchaseDiscount?.amount, 1000000, "cannot exceed goods subtotal");
        assert.eq(r.j?.firstPurchaseDiscount?.fixed, 1000000, "capped fixed value");
      },
    ));

  test("fixed discount is stored and returned to the order invoice", async () =>
    withSettings(
      { firstPurchaseDiscountType: "amount", firstPurchaseAmount: "150000" },
      async () => {
        const r = await api("/orders", {
          method: "POST",
          cookie: orderBuyer.cookie,
          body: orderBody(orderBuyer.phone, [{ id: product.id, qty: 1 }]),
        });
        assert.status(r, 201);
        assert.eq(r.j?.order?.discountSource, "first", "discount source");
        assert.eq(r.j?.order?.discountPercent, 0, "fixed discount has no percent");
        assert.eq(r.j?.order?.discountAmount, 150000, "applied amount");
        assert.eq(r.j?.order?.discountFixed, 150000, "receipt-facing fixed amount");
      },
    ));

  test("percent mode still works for legacy and new settings", async () =>
    withSettings(
      { firstPurchaseDiscountType: "percent", firstPurchasePercent: "15" },
      async () => {
        const r = await quote(percentBuyer);
        assert.status(r, 200);
        assert.eq(r.j?.discount?.source, "first");
        assert.eq(r.j?.discount?.percent, 15, "percent is retained");
        assert.eq(r.j?.discount?.amount, 150000, "percentage calculation");
        assert.eq(r.j?.discount?.fixed, 0, "percentage is not reported as fixed");
      },
    ));

  test("larger coupon still wins over fixed first-purchase discount", async () =>
    withSettings(
      {
        firstPurchaseDiscountType: "amount",
        firstPurchaseAmount: "150000",
        couponEnabled: "1",
        couponCodesJson: JSON.stringify([{ code: "FIRST25", percent: 25 }]),
      },
      async () => {
        const r = await quote(couponBuyer, undefined, "FIRST25");
        assert.status(r, 200);
        assert.eq(r.j?.discount?.source, "coupon", "larger coupon wins");
        assert.eq(r.j?.discount?.amount, 250000, "coupon amount");
        assert.eq(r.j?.discount?.code, "FIRST25", "winning coupon code");
      },
    ));

  test("larger loyalty discount still wins over fixed first-purchase discount", async () =>
    withSettings(
      {
        firstPurchaseDiscountType: "amount",
        firstPurchaseAmount: "150000",
        starsConfigJson: JSON.stringify([
          {
            points: 1,
            title: "ستارهٔ آزمایشی",
            desc: "",
            perks: ["discount"],
            discountType: "amount",
            discountPercent: 0,
            discountAmount: 200000,
          },
        ]),
      },
      async () => {
        const r = await quote(starBuyer, starCookie);
        assert.status(r, 200);
        assert.eq(r.j?.discount?.source, "star", "loyalty wins");
        assert.eq(r.j?.discount?.amount, 200000, "loyalty amount");
        assert.eq(r.j?.discount?.fixed, 200000, "loyalty fixed value retained");
      },
    ));

  test("invalid first-purchase discount type is rejected by settings API", async () => {
    const r = await api("/admin/settings", {
      method: "PUT",
      cookie: ADMIN,
      body: { firstPurchaseDiscountType: "rotate" },
    });
    assert.status(r, 400, "invalid type rejected");
  });
}
