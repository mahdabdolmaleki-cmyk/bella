import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const BASE = "http://127.0.0.1:4000/api";
const MONGO = "mongodb://127.0.0.1:27017/bella_test";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const SA_PHONE = "09120000000", SA_EMAIL = "admin@test.local";
const SA_SID = crypto.createHash("sha256").update(`${SA_PHONE}\0${SA_EMAIL}`, "utf8").digest("hex");
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });
const ADMIN_COOKIE = "bella_admin=" + sign({ superAdmin: true, adminSessionId: SA_SID });
const rndPhone = () => "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");

const results = [];
function rec(group, name, expected, actual, verdict, note = "") {
  results.push({ group, name, expected, actual, verdict, note });
  const icon = verdict === "PASS" ? "OK " : verdict === "BUG" ? "BUG" : verdict === "FAIL" ? "ERR" : "i  ";
  console.log(`${icon} [${group}] ${name} => ${verdict} (expected: ${expected} | actual: ${actual})${note ? " :: " + note : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rip = () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method, headers: { "Content-Type": "application/json", "X-Forwarded-For": rip(), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") || "" };
}

await mongoose.connect(MONGO);
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");
const { default: Order } = await import("./src/models/Order.js");
const { default: Settings } = await import("./src/models/Settings.js");

async function mkUser() {
  const phone = rndPhone();
  const u = await User.create({ phone, name: "کاربر تست", tokenVersion: 0 });
  return { u, phone, cookie: "bella_token=" + sign({ sub: String(u._id), tv: u.tokenVersion ?? 0 }) };
}
const cats = await api("/categories");
const catId = cats.json?.categories?.[0]?.id ?? cats.json?.categories?.[0]?._id ?? null;
async function mkProduct(p) {
  return api("/admin/products", { method: "POST", cookie: ADMIN_COOKIE, body: { active: true, stock: 10, category: catId, ...p } });
}

console.log("=== SEED ===");
const p1 = await mkProduct({ name: "عطر A " + Date.now(), nameEn: "A", price: 1000000 });
const p2 = await mkProduct({ name: "عطر B " + Date.now(), nameEn: "B", price: 500000 });
const pOOS = await mkProduct({ name: "ناموجود " + Date.now(), nameEn: "OOS", price: 800000, stock: 0 });
const pBig = await mkProduct({ name: "گران " + Date.now(), nameEn: "Big", price: 5000000 });
rec("admin", "ساخت محصول با توکن ادمین", "201", String(p1.status), p1.status === 201 ? "PASS" : "FAIL", String(p1.json?.error || ""));
const id1 = p1.json?.product?.id, id2 = p2.json?.product?.id, idOOS = pOOS.json?.product?.id, idBig = pBig.json?.product?.id;
console.log("ids:", { id1, id2, idOOS, idBig, catId });

await Settings.findOneAndUpdate({}, { $set: {
  couponEnabled: "1",
  couponCodesJson: JSON.stringify([{ code: "PCT10", percent: 10 }, { code: "AMT100", amount: 100000 }, { code: "BOTH", percent: 15, amount: 100000 }]),
  firstPurchaseDiscountEnabled: "1", firstPurchasePercent: "20",
} }, { upsert: true });
await sleep(5500);

const baseOrder = (items, phone, extra = {}) => ({
  customerName: "کاربر تست", phone, email: "t@t.com", province: "تهران", city: "تهران",
  postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲",
  termsAccepted: true, items, shippingMethod: "tipax", ...extra,
});

console.log("\n=== AUTH / OTP ===");
const otpPhone = rndPhone();
const otpReq = await api("/otp/request", { method: "POST", body: { phone: otpPhone, channel: "sms" } });
console.log("  otp/request ->", otpReq.status, JSON.stringify(otpReq.json));
rec("auth", "OTP request شمارهٔ معتبر → devCode", "200 + devCode", `${otpReq.status} devCode=${otpReq.json?.devCode}`, otpReq.status === 200 && otpReq.json?.devCode ? "PASS" : "FAIL");
const otpBad = await api("/otp/request", { method: "POST", body: { phone: "123", channel: "sms" } });
rec("auth", "OTP request شمارهٔ نامعتبر", "400", String(otpBad.status), otpBad.status === 400 ? "PASS" : "FAIL");
const otpVer = await api("/otp/verify", { method: "POST", body: { phone: otpPhone, code: otpReq.json?.devCode } });
rec("auth", "OTP verify کد درست → ticket", "200 + ticket", String(otpVer.status), otpVer.status === 200 && otpVer.json?.ticket ? "PASS" : "FAIL");
const otpVerBad = await api("/otp/verify", { method: "POST", body: { phone: otpPhone, code: "000000" } });
rec("auth", "OTP verify کد غلط", "4xx", String(otpVerBad.status), otpVerBad.status >= 400 ? "PASS" : "FAIL");
rec("auth", "/auth/me بدون کوکی", "401", String((await api("/auth/me")).status), (await api("/auth/me")).status === 401 ? "PASS" : "FAIL");

console.log("\n=== PRODUCTS ===");
const list = await api("/products?limit=50");
rec("products", "لیست محصولات", "200", String(list.status), list.status === 200 ? "PASS" : "FAIL");
rec("products", "تک‌محصول معتبر", "200", String((await api(`/products/${id1}`)).status), (await api(`/products/${id1}`)).status === 200 ? "PASS" : "FAIL");
rec("products", "تک‌محصول ناموجود", "404", String((await api(`/products/99999999`)).status), (await api(`/products/99999999`)).status === 404 ? "PASS" : "FAIL");

console.log("\n=== CART ===");
rec("cart", "track بدون لاگین", "tracked:false", JSON.stringify((await api("/cart/track", { method: "POST", body: { items: [{ id: id1, qty: 1 }] } })).json), (await api("/cart/track", { method: "POST", body: { items: [{ id: id1, qty: 1 }] } })).json?.tracked === false ? "PASS" : "FAIL");
const U1 = await mkUser();
const cartAuth = await api("/cart/track", { method: "POST", cookie: U1.cookie, body: { items: [{ id: id1, qty: 2 }] } });
rec("cart", "track با لاگین", "tracked:true", JSON.stringify(cartAuth.json), cartAuth.json?.tracked === true ? "PASS" : "FAIL");

console.log("\n=== ORDERS ===");
rec("orders", "بدون تأیید قوانین", "400", String((await api("/orders", { method: "POST", cookie: U1.cookie, body: baseOrder([{ id: id1, qty: 1 }], U1.phone, { termsAccepted: false }) })).status), (await api("/orders", { method: "POST", cookie: U1.cookie, body: baseOrder([{ id: id1, qty: 1 }], U1.phone, { termsAccepted: false }) })).status === 400 ? "PASS" : "FAIL");
rec("orders", "سبد خالی", "400", String((await api("/orders", { method: "POST", cookie: U1.cookie, body: baseOrder([], U1.phone) })).status), (await api("/orders", { method: "POST", cookie: U1.cookie, body: baseOrder([], U1.phone) })).status === 400 ? "PASS" : "FAIL");
rec("orders", "کالای ناموجود", "409", String((await api("/orders", { method: "POST", cookie: U1.cookie, body: baseOrder([{ id: idOOS, qty: 1 }], U1.phone) })).status), (await api("/orders", { method: "POST", cookie: U1.cookie, body: baseOrder([{ id: idOOS, qty: 1 }], U1.phone) })).status === 409 ? "PASS" : "FAIL");
const oTamper = await api("/orders", { method: "POST", cookie: U1.cookie, body: baseOrder([{ id: idBig, qty: 1, price: 1 }], U1.phone) });
rec("orders", "دستکاری قیمت کلاینت (price:1) → قیمت DB", "subtotal=5000000", String(oTamper.json?.order?.subtotal), oTamper.json?.order?.subtotal === 5000000 ? "PASS" : "FAIL");
// first-purchase 20% on a fresh user
const Ufp = await mkUser();
const o1 = await api("/orders", { method: "POST", cookie: Ufp.cookie, body: baseOrder([{ id: id1, qty: 1 }], Ufp.phone) });
const ord1 = o1.json?.order;
rec("orders", "سفارش معتبر + تخفیف خرید اول ۲۰٪", "201 + discount=200000", `${o1.status} disc=${ord1?.discountAmount}`, o1.status === 201 && ord1?.discountAmount === 200000 ? "PASS" : "FAIL");
rec("orders", "کاهش موجودی پس از سفارش", "9", String((await Product.findOne({ id: id1 }).select("stock"))?.stock), (await Product.findOne({ id: id1 }).select("stock"))?.stock === 9 ? "PASS" : "FAIL");
// coupon percent vs first-purchase (first purchase 20% bigger)
const Up = await mkUser();
const oPct = await api("/orders", { method: "POST", cookie: Up.cookie, body: baseOrder([{ id: idBig, qty: 1 }], Up.phone, { couponCode: "PCT10" }) });
rec("orders", "کوپن ۱۰٪ در برابر تخفیف خرید اول ۲۰٪ (بزرگ‌تر برنده)", "discount=1000000", String(oPct.json?.order?.discountAmount), oPct.json?.order?.discountAmount === 1000000 ? "PASS" : "FAIL");
// amount coupon for a non-first buyer
const Ua = await mkUser();
await api("/orders", { method: "POST", cookie: Ua.cookie, body: baseOrder([{ id: id2, qty: 1 }], Ua.phone) });
const oAmt = await api("/orders", { method: "POST", cookie: Ua.cookie, body: baseOrder([{ id: idBig, qty: 1 }], Ua.phone, { couponCode: "AMT100" }) });
rec("orders", "کوپن مبلغی ۱۰۰٬۰۰۰", "discount=100000", String(oAmt.json?.order?.discountAmount), oAmt.json?.order?.discountAmount === 100000 ? "PASS" : "FAIL");
const oAmt2 = await api("/orders", { method: "POST", cookie: Ua.cookie, body: baseOrder([{ id: idBig, qty: 1 }], Ua.phone, { couponCode: "AMT100" }) });
rec("orders", "استفادهٔ دوباره از کوپن یک‌بارمصرف", "400", String(oAmt2.status), oAmt2.status === 400 ? "PASS" : "FAIL");
// BUG percent+amount
const Ub = await mkUser();
await api("/orders", { method: "POST", cookie: Ub.cookie, body: baseOrder([{ id: id2, qty: 1 }], Ub.phone) });
const oBoth = await api("/orders", { method: "POST", cookie: Ub.cookie, body: baseOrder([{ id: idBig, qty: 1 }], Ub.phone, { couponCode: "BOTH" }) });
const bothDisc = oBoth.json?.order?.discountAmount;
rec("orders", "کوپن درصدی(۱۵٪=۷۵۰٬۰۰۰)+مبلغی(۱۰۰٬۰۰۰)", "۷۵۰٬۰۰۰ (بزرگ‌تر)", String(bothDisc), bothDisc === 100000 ? "BUG" : (bothDisc === 750000 ? "PASS" : "FAIL"), "کد همیشه مبلغی را می‌زند");
// COD
const Ucod = await mkUser();
const oCod = await api("/orders", { method: "POST", cookie: Ucod.cookie, body: baseOrder([{ id: id1, qty: 1 }], Ucod.phone, { shippingCod: true }) });
const cod = oCod.json?.order;
rec("orders", "پس‌کرایه: onlinePaid < total", "onlinePaid<total", `total=${cod?.total} online=${cod?.onlinePaid}`, cod && cod.onlinePaid < cod.total ? "PASS" : "FAIL");
rec("orders", "روش ارسال نامعتبر", "400", String((await api("/orders", { method: "POST", cookie: Ucod.cookie, body: baseOrder([{ id: id1, qty: 1 }], Ucod.phone, { shippingMethod: "nope" }) })).status), (await api("/orders", { method: "POST", cookie: Ucod.cookie, body: baseOrder([{ id: id1, qty: 1 }], Ucod.phone, { shippingMethod: "nope" }) })).status === 400 ? "PASS" : "FAIL");

console.log("\n=== PAYMENT (no gateway) ===");
rec("payment", "/start بدون درگاه", "503", String((await api("/payment/start", { method: "POST", body: { code: ord1?.code, phone: Ufp.phone } })).status), (await api("/payment/start", { method: "POST", body: { code: ord1?.code, phone: Ufp.phone } })).status === 503 ? "PASS" : "FAIL");
rec("payment", "/status شمارهٔ درست", "200", String((await api(`/payment/status/${ord1?.code}?phone=${Ufp.phone}`)).status), (await api(`/payment/status/${ord1?.code}?phone=${Ufp.phone}`)).status === 200 ? "PASS" : "FAIL");
rec("payment", "/status شمارهٔ غلط", "404", String((await api(`/payment/status/${ord1?.code}?phone=09999999999`)).status), (await api(`/payment/status/${ord1?.code}?phone=09999999999`)).status === 404 ? "PASS" : "FAIL");

console.log("\n=== REVIEWS ===");
const revGuest = await api(`/reviews/${id1}`, { method: "POST", body: { rating: 5, name: "مهمان", body: "عالی بود واقعاً" } });
rec("reviews", "نقد مهمان", "201", `${revGuest.status} pending=${revGuest.json?.pending}`, revGuest.status === 201 ? "PASS" : "FAIL");
await sleep(300);
const revList = await api(`/reviews/${id1}`);
const guestApproved = (revList.json?.reviews || []).some((r) => r.body === "عالی بود واقعاً");
rec("reviews", "نقد مهمان بی‌درنگ منتشر (بدون تأیید ادمین)", "pending", guestApproved ? "منتشر شد" : "منتشر نشد", guestApproved ? "BUG" : "PASS", "auto-approve");
rec("reviews", "امتیاز خارج از محدوده", "400", String((await api(`/reviews/${id1}`, { method: "POST", body: { rating: 9, name: "x", body: "متن به‌اندازهٔ کافی بلند" } })).status), (await api(`/reviews/${id1}`, { method: "POST", body: { rating: 9, name: "x", body: "متن به‌اندازهٔ کافی بلند" } })).status === 400 ? "PASS" : "FAIL");
const Uvb = await mkUser();
await api("/orders", { method: "POST", cookie: Uvb.cookie, body: baseOrder([{ id: id2, qty: 1 }], Uvb.phone) });
await api(`/reviews/${id2}`, { method: "POST", cookie: Uvb.cookie, body: { rating: 4, name: "خریدار", body: "خریدار تأییدشده؟" } });
await sleep(300);
const vb = ((await api(`/reviews/${id2}`)).json?.reviews || []).find((r) => r.body === "خریدار تأییدشده؟");
rec("reviews", "verifiedBuyer با سفارش پرداخت‌نشده", "false", String(vb?.verifiedBuyer), vb?.verifiedBuyer === true ? "BUG" : "PASS", "هر سفارشی کاربر را تأییدشده می‌کند");

console.log("\n=== ACCOUNT ===");
rec("account", "/loyalty", "200", String((await api("/account/loyalty", { cookie: U1.cookie })).status), (await api("/account/loyalty", { cookie: U1.cookie })).status === 200 ? "PASS" : "FAIL");
rec("account", "افزودن علاقه‌مندی", "ok", JSON.stringify((await api("/account/favorites", { method: "POST", cookie: U1.cookie, body: { productId: id1 } })).json), (await api("/account/favorites", { method: "POST", cookie: U1.cookie, body: { productId: id1 } })).json?.ok ? "PASS" : "FAIL");
// BUG: first-purchase after cancelled order
const Uc = await mkUser();
const oc = await api("/orders", { method: "POST", cookie: Uc.cookie, body: baseOrder([{ id: id2, qty: 1 }], Uc.phone) });
const ocOrder = await Order.findOne({ code: oc.json?.order?.code });
await api(`/admin/orders/${ocOrder?.id}`, { method: "PATCH", cookie: ADMIN_COOKIE, body: { status: "لغو شد" } });
await sleep(300);
const oAfter = await api("/orders", { method: "POST", cookie: Uc.cookie, body: baseOrder([{ id: id1, qty: 1 }], Uc.phone) });
const afterDisc = oAfter.json?.order?.discountAmount;
rec("orders", "تخفیف خرید اول پس از لغو اولین سفارش", "۲۰۰٬۰۰۰ (۲۰٪)", String(afterDisc), afterDisc === 0 ? "BUG" : (afterDisc === 200000 ? "PASS" : "FAIL"), "لغوشده مثل خرید قبلی شمرده می‌شود");
const cr = await api(`/account/orders/${oc.json?.order?.code}/cancel-request`, { method: "POST", cookie: Uc.cookie });
rec("account", "درخواست لغو روی سفارشِ لغوشده", "409", `${cr.status} ${JSON.stringify(cr.json)}`, cr.status === 200 && cr.json?.ok ? "BUG" : "PASS", "گارد «قبلاً لغو شده» مرده");

console.log("\n=== SHIPPING ===");
const ship = await api("/shipping/quote?province=تهران&subtotal=1000000");
rec("shipping", "استعلام ارسال", "200 + options", `${ship.status} opts=${ship.json?.options?.length}`, ship.status === 200 ? "PASS" : "FAIL");

await mongoose.disconnect();
const counts = results.reduce((a, r) => (a[r.verdict] = (a[r.verdict] || 0) + 1, a), {});
console.log("\n=== SUMMARY === " + JSON.stringify(counts));
import { writeFileSync } from "fs";
writeFileSync("/home/user/bella/server/test-results.json", JSON.stringify({ counts, results }, null, 2));
console.log("WROTE test-results.json (" + results.length + " scenarios)");
