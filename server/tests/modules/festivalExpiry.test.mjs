// Timer-driven festival cleanup restores the product state from before the campaign.
import { group, test, api, ADMIN, assert, mkProduct, M, BASE } from "../harness.mjs";
import { sweepExpiredFestival } from "../../src/jobs/festivalExpiry.js";

export async function register() {
  const { Product } = M();
  group("festival expiry");

  test("expired timer removes festival flags and restores original product discount/tag", async () => {
    const settingsResponse = await api("/admin/settings", { cookie: ADMIN });
    assert.status(settingsResponse, 200, "read settings before test");
    const previousActive = settingsResponse.j?.settings?.festivalActive ?? "true";
    const previousUntil = settingsResponse.j?.settings?.festivalUntil ?? "";

    const created = await mkProduct({
      name: "آزمون پایان خودکار جشنواره",
      nameEn: "Festival expiry restoration test",
      price: 1000000,
    });
    const id = Number(created?.id);
    assert.ok(id > 0, "test product id");

    try {
      await Product.updateOne(
        { id },
        {
          $set: {
            festival: false,
            discount: true,
            discountType: "amount",
            discountValue: 200000,
            oldPrice: 1200000,
            badge: "برچسب پیش از جشنواره",
          },
          $unset: { festivalSnapshot: 1 },
        },
      );

      const added = await api("/admin/products/campaign", {
        method: "POST",
        cookie: ADMIN,
        body: { ids: [id], festival: true, discount: true, badge: "جشنوارهٔ آزمایشی", discountPercent: 15 },
      });
      assert.status(added, 200, "add product to festival");

      const active = await Product.findOne({ id }).select("+festivalSnapshot").lean();
      assert.eq(active?.festival, true, "product is in festival");
      assert.eq(active?.discountType, "percent", "festival discount applied");
      assert.eq(active?.badge, "جشنوارهٔ آزمایشی", "festival badge applied");
      assert.eq(active?.festivalSnapshot?.oldPrice, 1200000, "original price is snapshotted");
      assert.eq(active?.festivalSnapshot?.badge, "برچسب پیش از جشنواره", "original badge is snapshotted");

      const noTimer = await api("/admin/settings", {
        method: "PUT",
        cookie: ADMIN,
        body: { festivalActive: "true", festivalUntil: "" },
      });
      assert.status(noTimer, 200, "disable timer for control check");
      assert.eq(await sweepExpiredFestival(Date.now()), 0, "without an end timer the campaign stays active");
      assert.eq((await Product.findOne({ id }).lean())?.festival, true, "no timer does not clear products");

      const expired = await api("/admin/settings", {
        method: "PUT",
        cookie: ADMIN,
        body: { festivalActive: "true", festivalUntil: String(Date.now() - 1000) },
      });
      assert.status(expired, 200, "set an expired timer");
      const cleanedCount = await sweepExpiredFestival(Date.now());
      const restored = await Product.findOne({ id }).select("+festivalSnapshot").lean();
      assert.ok(cleanedCount >= 1 || restored?.festival === false, "expired campaign cleans festival products");
      assert.eq(restored?.festival, false, "festival membership removed");
      assert.eq(restored?.discount, true, "pre-existing discount restored");
      assert.eq(restored?.discountType, "amount", "pre-existing discount type restored");
      assert.eq(restored?.discountValue, 200000, "pre-existing discount amount restored");
      assert.eq(restored?.oldPrice, 1200000, "pre-existing old price restored");
      assert.eq(restored?.badge, "برچسب پیش از جشنواره", "pre-existing badge restored");
      assert.eq(restored?.festivalSnapshot, undefined, "one-time snapshot removed after restore");

      // The public store API must expose the restored data immediately (not an
      // ISR/Redis-cached campaign payload), while the backend remains healthy.
      const publicResponse = await fetch(`${BASE}/products`);
      assert.eq(publicResponse.status, 200, "public product list works after expiry");
      assert.eq(
        publicResponse.headers.get("cache-control"),
        "no-store, no-cache, must-revalidate, private",
        "public product list is not cached",
      );
      const publicProducts = await publicResponse.json();
      const publicProduct = publicProducts?.products?.find((p) => p.id === id);
      assert.ok(publicProduct, "restored product appears in public list");
      assert.eq(publicProduct?.festival, false, "public list no longer marks product as festival");
      assert.eq(publicProduct?.badge, "برچسب پیش از جشنواره", "public list returns restored badge");
      const healthBase = BASE.replace(/\/api\/?$/, "");
      const health = await fetch(`${healthBase}/health`);
      assert.eq(health.status, 200, "backend health remains available after expiry cleanup");

      const afterSettings = await api("/admin/settings", { cookie: ADMIN });
      assert.eq(afterSettings.j?.settings?.festivalActive, "false", "expired festival banner disabled");
    } finally {
      await Product.deleteOne({ id });
      await api("/admin/settings", {
        method: "PUT",
        cookie: ADMIN,
        body: { festivalActive: previousActive, festivalUntil: previousUntil },
      });
    }
  });

  test("large expired campaigns restore in bounded batches without taking the API offline", async () => {
    const settingsResponse = await api("/admin/settings", { cookie: ADMIN });
    assert.status(settingsResponse, 200, "read settings before bulk expiry test");
    const previousActive = settingsResponse.j?.settings?.festivalActive ?? "true";
    const previousUntil = settingsResponse.j?.settings?.festivalUntil ?? "";
    const count = 201; // cross the worker's 200-product batch boundary
    const baseId = 900_000_000 + Math.floor(Math.random() * 80_000_000);

    try {
      await Product.insertMany(
        Array.from({ length: count }, (_, index) => ({
          id: baseId + index,
          name: `محصول تست پایان جشنواره ${index}`,
          nameEn: `Festival bulk test ${index}`,
          price: 100000,
          oldPrice: 110000,
          badge: "جشنوارهٔ آزمایشی",
          festival: true,
          discount: true,
          discountType: "percent",
          discountValue: 10,
          active: true,
          festivalSnapshot: {
            oldPrice: 120000,
            badge: "برچسب قبلی",
            discount: true,
            discountType: "amount",
            discountValue: 20000,
          },
        })),
      );
      const expired = await api("/admin/settings", {
        method: "PUT",
        cookie: ADMIN,
        body: { festivalActive: "true", festivalUntil: String(Date.now() - 1000) },
      });
      assert.status(expired, 200, "set expired timer for bulk cleanup");

      const cleaned = await sweepExpiredFestival(Date.now());
      assert.gte(cleaned, count, "all products across batches restored");
      assert.eq(
        await Product.countDocuments({ id: { $gte: baseId, $lt: baseId + count }, festival: true }),
        0,
        "no festival products remain after bulk cleanup",
      );
      const restored = await Product.findOne({ id: baseId }).select("+festivalSnapshot").lean();
      assert.eq(restored?.badge, "برچسب قبلی", "bulk restore keeps the prior badge");
      assert.eq(restored?.oldPrice, 120000, "bulk restore keeps the prior price");
      assert.eq(restored?.festivalSnapshot, undefined, "bulk restore clears private snapshot");
      const healthBase = BASE.replace(/\/api\/?$/, "");
      const health = await fetch(`${healthBase}/health`);
      assert.eq(health.status, 200, "API remains healthy after a multi-batch cleanup");
    } finally {
      await Product.deleteMany({ id: { $gte: baseId, $lt: baseId + count } });
      await api("/admin/settings", {
        method: "PUT",
        cookie: ADMIN,
        body: { festivalActive: previousActive, festivalUntil: previousUntil },
      });
    }
  });
}
