// Commerce coverage: orders, loyalty/stars, gifts, coupons, account, admin CRUD.
import { group, test, api, ADMIN, mkUser, mkProduct, orderBody, rndPhone, assert, M, sleep, sign } from "../harness.mjs";

export async function register() {
  const { Settings, ReferralCode, User, Product } = M();
  // Clean slate for the (capped, id-sorted) gift pool so repeated runs stay deterministic.
  await Product.deleteMany({ gift: true });

  // ---------------- ADMIN PRODUCT CRUD ----------------
  group("admin");
  test("create product", async () => { const p = await mkProduct({ name: "ادمین تست", price: 500000 }); assert.ok(p?.id, "product id"); });
  const perf = await mkProduct({ name: "عطر نوع", productType: "perfume", sizeMl: 50 });
  const gen = await mkProduct({ name: "غیرعطر نوع", productType: "general", sizeMl: 200 });
  test("perfume product keeps type", async () => { const r = await api(`/products/${perf.id}`); assert.eq(r.j?.product?.productType, "perfume"); });
  test("general product keeps type", async () => { const r = await api(`/products/${gen.id}`); assert.eq(r.j?.product?.productType, "general"); });
  test("sizeMl persists", async () => { const r = await api(`/products/${perf.id}`); assert.eq(r.j?.product?.sizeMl, 50); });
  const giftProd = await mkProduct({ name: "هدیه تست", gift: true, price: 300000 });
  test("gift flag persists", async () => { const r = await api(`/products/${giftProd.id}`); assert.eq(r.j?.product?.gift, true); });
  test("gifts pool includes marked product", async () => { const r = await api("/products/gifts"); assert.ok((r.j?.gifts || []).some((g) => g.id === giftProd.id), "gift in pool"); });
  test("update product price", async () => { const r = await api(`/admin/products/${perf.id}`, { method: "PATCH", cookie: ADMIN, body: { price: 750000 } }); assert.eq(r.j?.product?.price, 750000); });
  test("stock adjust", async () => { const r = await api(`/admin/products/${perf.id}/stock`, { method: "POST", cookie: ADMIN, body: { delta: -5 } }); assert.ok(r.s === 200, `stock ${r.s}`); });
  test("delete product", async () => { const tmp = await mkProduct({ name: "حذفی" }); const r = await api(`/admin/products/${tmp.id}`, { method: "DELETE", cookie: ADMIN }); assert.status(r, 200); });
  test("admin create rejects missing name", async () => assert.ok((await api("/admin/products", { method: "POST", cookie: ADMIN, body: { price: 100, active: true } })).s >= 400));

  // ---------------- ORDERS (require login) ----------------
  group("orders");
  const buyer = await mkUser({ name: "خریدار" });
  const p1 = await mkProduct({ name: "سفارش الف", price: 1000000, stock: 500, points: 5 });
  test("guest order → 401", async () => assert.status(await api("/orders", { method: "POST", body: orderBody(buyer.phone, [{ id: p1.id, qty: 1 }]) }), 401));
  test("logged-in order creates 201", async () => { const r = await api("/orders", { method: "POST", cookie: buyer.cookie, body: orderBody(buyer.phone, [{ id: p1.id, qty: 1 }]) }); assert.status(r, 201); assert.ok(r.j?.order?.id || r.j?.order?._id, "order id"); });
  test("order missing terms → 4xx", async () => { const b = orderBody(buyer.phone, [{ id: p1.id, qty: 1 }]); delete b.termsAccepted; assert.gte((await api("/orders", { method: "POST", cookie: buyer.cookie, body: b })).s, 400); });
  test("order empty items → 4xx", async () => assert.gte((await api("/orders", { method: "POST", cookie: buyer.cookie, body: orderBody(buyer.phone, []) })).s, 400));
  test("order bad phone → 4xx", async () => assert.gte((await api("/orders", { method: "POST", cookie: buyer.cookie, body: orderBody("123", [{ id: p1.id, qty: 1 }]) })).s, 400));
  test("order bad postal → 4xx", async () => { const b = orderBody(buyer.phone, [{ id: p1.id, qty: 1 }]); b.postalCode = "12"; assert.gte((await api("/orders", { method: "POST", cookie: buyer.cookie, body: b })).s, 400); });
  test("order nonexistent product → 4xx", async () => assert.gte((await api("/orders", { method: "POST", cookie: buyer.cookie, body: orderBody(buyer.phone, [{ id: 99999999, qty: 1 }]) })).s, 400));
  test("order qty 0 clamped to ≥1 → 201", async () => { const r = await api("/orders", { method: "POST", cookie: buyer.cookie, body: orderBody(buyer.phone, [{ id: p1.id, qty: 0 }]) }); assert.status(r, 201); assert.gte((r.j?.order?.items || [])[0]?.qty ?? 0, 1, "qty clamped to ≥1"); });
  test("order qty negative clamped → 201", async () => { const r = await api("/orders", { method: "POST", cookie: buyer.cookie, body: orderBody(buyer.phone, [{ id: p1.id, qty: -3 }]) }); assert.status(r, 201); });
  test("order over stock → 4xx/409", async () => { const lim = await mkProduct({ name: "کم موجود", price: 100000, stock: 2 }); assert.ok([400, 409].includes((await api("/orders", { method: "POST", cookie: buyer.cookie, body: orderBody(buyer.phone, [{ id: lim.id, qty: 99 }]) })).s)); });
  test("inactive product not orderable → 4xx", async () => { const off = await mkProduct({ name: "غیرفعال", active: false, price: 100000, stock: 10 }); assert.gte((await api("/orders", { method: "POST", cookie: buyer.cookie, body: orderBody(buyer.phone, [{ id: off.id, qty: 1 }]) })).s, 400); });

  // ---------------- LOYALTY / STARS / GIFTS ----------------
  group("loyalty");
  const s = await Settings.getSingleton();
  s.starsConfigJson = JSON.stringify([{ points: 1, title: "ستارهٔ ۱", desc: "", perks: ["vipbox", "freeship", "gift", "discount"], discountType: "percent", discountPercent: 10 }]);
  s.vipBoxEnabled = "1"; s.vipBoxFee = "50000"; s.shippingFreeThreshold = "999999999";
  s.firstPurchaseDiscountEnabled = "0"; s.couponEnabled = "0";
  await s.save();
  await sleep(5400); // settings cache TTL
  const perkProd = await mkProduct({ name: "مزایا", price: 1000000, stock: 500, points: 5 });
  const starU = await User.create({ name: "ستاره‌دار", phone: rndPhone(), tokenVersion: 0, points: 5 });
  const starCookie = "bella_token=" + sign({ sub: String(starU._id), tv: 0 });
  test("star user gets free shipping", async () => { const r = await api("/orders", { method: "POST", cookie: starCookie, body: orderBody(starU.phone, [{ id: perkProd.id, qty: 1 }]) }); assert.eq(r.j?.order?.shippingCost, 0, "freeship"); });
  test("star user gets discount", async () => { const r = await api("/orders", { method: "POST", cookie: starCookie, body: orderBody(starU.phone, [{ id: perkProd.id, qty: 1 }]) }); assert.gt(r.j?.order?.discountAmount ?? 0, 0, "discount"); });
  test("star user gets auto vipbox", async () => { const r = await api("/orders", { method: "POST", cookie: starCookie, body: orderBody(starU.phone, [{ id: perkProd.id, qty: 1 }]) }); assert.eq(r.j?.order?.vipBox, true); assert.eq(r.j?.order?.vipBoxFee, 0); });
  test("star user starGift flagged", async () => { const r = await api("/orders", { method: "POST", cookie: starCookie, body: orderBody(starU.phone, [{ id: perkProd.id, qty: 1 }]) }); assert.eq(r.j?.order?.starGift, true); });
  const noStarU = await User.create({ name: "بدون ستاره", phone: rndPhone(), tokenVersion: 0, points: 0 });
  const noStarCookie = "bella_token=" + sign({ sub: String(noStarU._id), tv: 0 });
  test("no-star user gets no perks", async () => { const r = await api("/orders", { method: "POST", cookie: noStarCookie, body: orderBody(noStarU.phone, [{ id: perkProd.id, qty: 1 }]) }); assert.gt(r.j?.order?.shippingCost ?? 0, 0); assert.eq(r.j?.order?.discountAmount ?? 0, 0); assert.eq(r.j?.order?.starGift, false); });

  const giftA = await mkProduct({ name: "هدیه الف", gift: true, price: 200000, stock: 50, active: true });
  const giftB = await mkProduct({ name: "هدیه ب", gift: true, price: 250000, stock: 50, active: true });
  const nonGift = await mkProduct({ name: "غیرهدیه", price: 200000, stock: 50, active: true });
  test("eligible user selects gift → free item", async () => {
    const r = await api("/orders", { method: "POST", cookie: starCookie, body: orderBody(starU.phone, [{ id: perkProd.id, qty: 1 }], { giftId: giftA.id }) });
    const gi = (r.j?.order?.items || []).find((it) => it.gift);
    assert.ok(gi, "gift item present"); assert.eq(gi.price, 0, "gift free");
  });
  test("ineligible user gets no gift", async () => {
    const fresh = await mkUser({ name: "نامشمول", points: 0 });
    const zeroPt = await mkProduct({ name: "بدون امتیاز", price: 500000, stock: 100, points: 0 });
    const r = await api("/orders", { method: "POST", cookie: fresh.cookie, body: orderBody(fresh.phone, [{ id: zeroPt.id, qty: 1 }], { giftId: giftA.id }) });
    assert.ok(!(r.j?.order?.items || []).some((it) => it.gift), `no gift for ineligible (s=${r.s})`);
  });
  test("non-gift product cannot be claimed as gift", async () => {
    const r = await api("/orders", { method: "POST", cookie: starCookie, body: orderBody(starU.phone, [{ id: perkProd.id, qty: 1 }], { giftId: nonGift.id }) });
    assert.ok(!(r.j?.order?.items || []).some((it) => it.gift && it.id === nonGift.id), "non-gift rejected");
  });
  test("gift order total excludes gift price", async () => {
    const r = await api("/orders", { method: "POST", cookie: starCookie, body: orderBody(starU.phone, [{ id: perkProd.id, qty: 1 }], { giftId: giftB.id }) });
    const o = r.j?.order; const itemsSum = (o.items || []).reduce((a, it) => a + (it.price || 0) * (it.qty || 1), 0);
    assert.ok(o.total <= itemsSum + (o.shippingCost || 0), "gift not counted");
  });

  // ---------------- COUPONS / ACCOUNT ----------------
  group("account");
  const cu = await mkUser();
  const day = 86400000;
  const stamp = Date.now();
  await ReferralCode.create([
    { code: "TACT" + stamp, owner: cu.u._id, kind: "referee", percent: 10, amount: 0, used: false, expiresAt: new Date(Date.now() + 5 * day) },
    { code: "TUSE" + stamp, owner: cu.u._id, kind: "referrer", percent: 0, amount: 50000, used: true, expiresAt: new Date(Date.now() + 5 * day) },
    { code: "TEXP" + stamp, owner: cu.u._id, kind: "referee", percent: 15, amount: 0, used: false, expiresAt: new Date(Date.now() - 2 * day) },
  ]);
  test("account coupons returns 3 with status", async () => { const r = await api("/account/coupons", { cookie: cu.cookie }); assert.status(r, 200); assert.eq((r.j?.coupons || []).length, 3); const st = (r.j.coupons || []).map((x) => x.status).sort(); assert.ok(st.includes("active") && st.includes("used") && st.includes("expired"), "statuses"); });
  test("account coupons empty for new user", async () => { const r = await api("/account/coupons", { cookie: (await mkUser()).cookie }); assert.status(r, 200); assert.eq((r.j?.coupons || []).length, 0); });
  test("account loyalty returns payload", async () => { const r = await api("/account/loyalty", { cookie: cu.cookie }); assert.status(r, 200); assert.ok(r.j && typeof r.j === "object", "loyalty payload"); });
  test("account favorites", async () => assert.status(await api("/account/favorites", { cookie: cu.cookie }), 200));

  // ---------------- REFERRAL DISCOUNTS + ADMIN REFERRAL NETWORK ----------------
  group("referrals");
  const referralProduct = await mkProduct({ name: "محصول تست کد معرف", price: 1000000, stock: 50 });
  const activeReferralCode = "TACT" + stamp;
  test("cart quote recognizes owned referral code while public coupons are off", async () => {
    const r = await api("/shipping/quote", {
      method: "POST",
      cookie: cu.cookie,
      body: { province: "تهران", items: [{ id: referralProduct.id, qty: 1 }], phone: cu.phone, couponCode: activeReferralCode },
    });
    assert.status(r, 200);
    assert.eq(r.j?.coupon?.error, "");
    assert.eq(r.j?.coupon?.applied?.code, activeReferralCode);
    assert.eq(r.j?.coupon?.applied?.amount, 100000);
  });
  test("cart quote rejects a used referral code with its exact reason", async () => {
    const r = await api("/shipping/quote", {
      method: "POST", cookie: cu.cookie,
      body: { province: "تهران", items: [{ id: referralProduct.id, qty: 1 }], couponCode: "TUSE" + stamp },
    });
    assert.status(r, 200);
    assert.includes(r.j?.coupon?.error, "قبلاً استفاده شده");
  });
  test("cart quote rejects an expired referral code", async () => {
    const r = await api("/shipping/quote", {
      method: "POST", cookie: cu.cookie,
      body: { province: "تهران", items: [{ id: referralProduct.id, qty: 1 }], couponCode: "TEXP" + stamp },
    });
    assert.status(r, 200);
    assert.includes(r.j?.coupon?.error, "مهلت این کد تخفیف تمام شده");
  });
  const foreignReferralOwner = await mkUser();
  const foreignReferralCode = "TOTH" + stamp;
  await ReferralCode.create({ code: foreignReferralCode, owner: foreignReferralOwner.u._id, kind: "referee", percent: 10, expiresAt: new Date(Date.now() + 5 * day) });
  test("cart quote does not accept another account's referral code", async () => {
    const r = await api("/shipping/quote", {
      method: "POST", cookie: cu.cookie,
      body: { province: "تهران", items: [{ id: referralProduct.id, qty: 1 }], couponCode: foreignReferralCode },
    });
    assert.status(r, 200);
    assert.includes(r.j?.coupon?.error, "متعلق به حساب شما نیست");
  });
  test("order accepts and burns owned referral coupon while public coupons are off", async () => {
    const r = await api("/orders", {
      method: "POST", cookie: cu.cookie,
      body: orderBody(cu.phone, [{ id: referralProduct.id, qty: 1 }], { couponCode: activeReferralCode }),
    });
    assert.status(r, 201);
    assert.eq(r.j?.order?.couponCode, activeReferralCode);
    assert.eq(r.j?.order?.discountAmount, 100000);
    const stored = await ReferralCode.findOne({ code: activeReferralCode }).lean();
    assert.eq(stored?.used, true, "referral code burned after order creation");
  });
  test("cart quote shows used after the accepted referral order", async () => {
    const r = await api("/shipping/quote", {
      method: "POST", cookie: cu.cookie,
      body: { province: "تهران", items: [{ id: referralProduct.id, qty: 1 }], couponCode: activeReferralCode },
    });
    assert.status(r, 200);
    assert.includes(r.j?.coupon?.error, "قبلاً استفاده شده");
  });

  const networkStamp = Date.now();
  const referralParent = await mkUser({ name: `معرف-${networkStamp}` });
  const referralChild = await mkUser({ name: `زیرمجموعه-${networkStamp}`, referredBy: referralParent.u._id });
  test("admin customer list includes referrer and direct referral count", async () => {
    const r = await api(`/admin/users?search=${encodeURIComponent(referralParent.u.name)}`, { cookie: ADMIN });
    assert.status(r, 200);
    const parent = (r.j?.users || []).find((u) => u.id === String(referralParent.u._id));
    assert.eq(parent?.referralCount, 1);
  });
  test("admin customer row includes direct referrer's name and contact", async () => {
    const r = await api(`/admin/users?search=${encodeURIComponent(referralChild.u.name)}`, { cookie: ADMIN });
    assert.status(r, 200);
    const child = (r.j?.users || []).find((u) => u.id === String(referralChild.u._id));
    assert.eq(child?.referredBy?.id, String(referralParent.u._id));
    assert.eq(child?.referredBy?.name, referralParent.u.name);
    assert.eq(child?.referredBy?.phone, referralParent.phone);
  });
  test("admin referral details lists direct child name and contact", async () => {
    const r = await api(`/admin/users/${referralParent.u._id}/referrals`, { cookie: ADMIN });
    assert.status(r, 200);
    assert.eq(r.j?.referralCount, 1);
    assert.eq(r.j?.referrals?.[0]?.id, String(referralChild.u._id));
    assert.eq(r.j?.referrals?.[0]?.name, referralChild.u.name);
    assert.eq(r.j?.referrals?.[0]?.phone, referralChild.phone);
  });

  // ---------------- IDENTITY SINGLE-CHANNEL (⑧) — fresh user per case (OTP cooldown) ----------------
  group("identity");
  const mkBoth = async () => { const u = await User.create({ name: "دوکاناله", phone: rndPhone(), email: `id${Date.now()}${Math.floor(Math.random() * 1e6)}@ex.com`, tokenVersion: 0, emailVerified: true, phoneVerified: true }); return "bella_token=" + sign({ sub: String(u._id), tv: 0 }); };
  test("email change → current stage via email (single channel)", async () => { const ck = await mkBoth(); const r = await api("/auth/me/identity/request-otp", { method: "POST", cookie: ck, body: { field: "email", value: `new${Date.now()}@ex.com`, stage: "current" } }); assert.eq(r.j?.channel, "email", "current channel email"); });
  test("phone change → current stage via sms", async () => { const ck = await mkBoth(); const r = await api("/auth/me/identity/request-otp", { method: "POST", cookie: ck, body: { field: "phone", value: rndPhone(), stage: "current" } }); assert.eq(r.j?.channel, "sms"); });
  test("explicit channel override (sms for email change)", async () => { const ck = await mkBoth(); const r = await api("/auth/me/identity/request-otp", { method: "POST", cookie: ck, body: { field: "email", value: `ov${Date.now()}${Math.floor(Math.random() * 1e6)}@ex.com`, stage: "current", channel: "sms" } }); assert.eq(r.j?.channel, "sms"); });
  test("full email-change flow (single channel) applies end-to-end", async () => {
    const ck = await mkBoth();
    const newEmail = `done${Date.now()}${Math.floor(Math.random() * 1e6)}@ex.com`;
    const r1 = await api("/auth/me/identity/request-otp", { method: "POST", cookie: ck, body: { field: "email", value: newEmail, stage: "current" } });
    assert.eq(r1.j?.channel, "email", "current via email");
    const v1 = await api("/auth/me/identity/verify-otp", { method: "POST", cookie: ck, body: { field: "email", value: newEmail, stage: "current", code: r1.j?.devCode } });
    assert.ok(v1.j?.ticket, "current ticket");
    const r2 = await api("/auth/me/identity/request-otp", { method: "POST", cookie: ck, body: { field: "email", value: newEmail, stage: "destination", currentTicket: v1.j.ticket } });
    assert.eq(r2.j?.channel, "email", "destination via email");
    const v2 = await api("/auth/me/identity/verify-otp", { method: "POST", cookie: ck, body: { field: "email", value: newEmail, stage: "destination", code: r2.j?.devCode } });
    assert.ok(v2.j?.ticket, "destination ticket");
    const pr = await api("/auth/me", { method: "PATCH", cookie: ck, body: { email: newEmail, emailTicket: v2.j.ticket } });
    assert.status(pr, 200);
    assert.eq(pr.j?.user?.email, newEmail, "email changed");
  });
}
