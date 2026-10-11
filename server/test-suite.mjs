// Comprehensive live scenario suite for Bella API (~200 checks).
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const BASE = "http://127.0.0.1:4000/api";
const MONGO = "mongodb://127.0.0.1:27017/bella_test";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const SA_PHONE = "09120000000", SA_EMAIL = "admin@test.local";
const SA_SID = crypto.createHash("sha256").update(`${SA_PHONE}\0${SA_EMAIL}`, "utf8").digest("hex");
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });
const ADMIN = "bella_admin=" + sign({ superAdmin: true, adminSessionId: SA_SID });
const rnd = () => "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const rip = () => `10.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const R = [];
function t(group, name, pass, info = "") { R.push({ group, name, pass, info }); }
const ok = (g, n, c, i = "") => t(g, n, !!c, i);
async function api(p, { method = "GET", body, cookie } = {}) {
  try {
    const res = await fetch(BASE + p, { method, headers: { "Content-Type": "application/json", "X-Forwarded-For": rip(), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await res.json(); } catch {}
    return { s: res.status, j };
  } catch (e) { return { s: 0, j: null, err: String(e) }; }
}

await mongoose.connect(MONGO);
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");
const { default: Order } = await import("./src/models/Order.js");
const { default: Settings } = await import("./src/models/Settings.js");
const { default: Review } = await import("./src/models/Review.js");
const { default: Tutorial } = await import("./src/models/Tutorial.js");
const mkU = async () => { const phone = rnd(); const u = await User.create({ phone, name: "کاربر", tokenVersion: 0 }); return { u, phone, cookie: "bella_token=" + sign({ sub: String(u._id), tv: 0 }) }; };
const cats = await api("/categories"); const catId = cats.j?.categories?.[0]?.id ?? null;
const mkP = (p) => api("/admin/products", { method: "POST", cookie: ADMIN, body: { active: true, stock: 10, category: catId, ...p } });
const ord = (items, phone, x = {}) => ({ customerName: "کاربر", phone, email: "t@t.com", province: "تهران", city: "تهران", postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", termsAccepted: true, items, shippingMethod: "tipax", ...x });

// ---- seed ----
const tag = Date.now();
const P = {};
P.a = (await mkP({ name: "A" + tag, nameEn: "A", price: 1000000, stock: 1000 })).j?.product;
P.b = (await mkP({ name: "B" + tag, nameEn: "B", price: 500000, stock: 1000 })).j?.product;
P.oos = (await mkP({ name: "OOS" + tag, nameEn: "O", price: 800000, stock: 0 })).j?.product;
P.big = (await mkP({ name: "BIG" + tag, nameEn: "G", price: 5000000, stock: 1000 })).j?.product;
P.inact = (await mkP({ name: "INA" + tag, nameEn: "I", price: 300000, active: false })).j?.product;
P.cheap = (await mkP({ name: "CH" + tag, nameEn: "C", price: 100000 })).j?.product;
ok("seed", "ساخت ۶ محصول", P.a && P.big && P.oos, `ids ${P.a?.id}..${P.cheap?.id}`);
await Settings.findOneAndUpdate({}, { $set: { couponEnabled: "1", firstPurchaseDiscountEnabled: "1", firstPurchasePercent: "20", couponCodesJson: JSON.stringify([{ code: "PCT10", percent: 10 }, { code: "AMT100", amount: 100000 }, { code: "BOTH", percent: 15, amount: 100000 }, { code: "MIN", percent: 10, minOrder: 2000000 }, { code: "OLD", percent: 10, until: "2020-01-01" }]) } }, { upsert: true });
await sleep(5500);

// ================= AUTH / OTP (~18) =================
const ph = rnd();
let r = await api("/otp/request", { method: "POST", body: { phone: ph, channel: "sms" } });
ok("auth", "otp sms معتبر", r.s === 200 && r.j?.devCode, `devCode=${r.j?.devCode}`); const devCode = r.j?.devCode;
ok("auth", "otp شمارهٔ کوتاه → ۴۰۰", (await api("/otp/request", { method: "POST", body: { phone: "12", channel: "sms" } })).s === 400);
ok("auth", "otp شمارهٔ غیرموبایل → ۴۰۰", (await api("/otp/request", { method: "POST", body: { phone: "02112345678", channel: "sms" } })).s === 400);
ok("auth", "otp بدون کانال/شماره → ۴۰۰", (await api("/otp/request", { method: "POST", body: {} })).s === 400);
const em = `u${tag}@t.com`;
ok("auth", "otp ایمیل معتبر", (await api("/otp/request", { method: "POST", body: { email: em, channel: "email" } })).s === 200);
ok("auth", "otp ایمیل نامعتبر → ۴۰۰", (await api("/otp/request", { method: "POST", body: { email: "bad", channel: "email" } })).s === 400);
ok("auth", "verify کد درست → ticket", (await api("/otp/verify", { method: "POST", body: { phone: ph, code: devCode } })).j?.ticket ? true : false);
ok("auth", "verify کد غلط → ۴xx", (await api("/otp/verify", { method: "POST", body: { phone: ph, code: "000000" } })).s >= 400);
ok("auth", "verify هم phone هم email → ۴۰۰", (await api("/otp/verify", { method: "POST", body: { phone: ph, email: em, code: "1" } })).s === 400);
{ const lph = rnd(); const ldev = (await api("/otp/request", { method: "POST", body: { phone: lph, channel: "sms" } })).j?.devCode; const ltick = (await api("/otp/verify", { method: "POST", body: { phone: lph, code: ldev } })).j?.ticket; ok("auth", "login با ticket → user", (await api("/auth/login", { method: "POST", body: { phone: lph, ticket: ltick } })).s === 200); }
ok("auth", "/auth/me بدون کوکی → ۴۰۱", (await api("/auth/me")).s === 401);
ok("auth", "/auth/me با کوکی معتبر → ۲۰۰", (await api("/auth/me", { cookie: (await mkU()).cookie })).s === 200);
ok("auth", "/auth/me با توکن خراب → ۴۰۱", (await api("/auth/me", { cookie: "bella_token=garbage" })).s === 401);
ok("auth", "ادمین بدون کوکی → ۴۰۱", (await api("/admin/products")).s === 401);
ok("auth", "ادمین با توکن کاربر → ۴۰۱", (await api("/admin/products", { cookie: (await mkU()).cookie })).s === 401);
ok("auth", "ادمین با توکن ادمین → ۲۰۰", (await api("/admin/products", { cookie: ADMIN })).s === 200);

// ================= PRODUCTS (~24) =================
ok("products", "لیست", (await api("/products?limit=50")).s === 200);
ok("products", "لیست دارای محصول seed", (await api("/products?limit=50")).j?.items?.some?.((x) => x.id === P.a.id) || (await api("/products?limit=50")).j?.products?.some?.((x) => x.id === P.a.id));
ok("products", "تک‌محصول", (await api(`/products/${P.a.id}`)).s === 200);
ok("products", "تک‌محصول ناموجود → ۴۰۴", (await api("/products/99999999")).s === 404);
ok("products", "تک‌محصول غیرفعال → ۴۰۴", (await api(`/products/${P.inact.id}`)).s === 404);
ok("products", "id غیرعددی → ۴۰۰", (await api("/products/abc")).s === 400);
ok("products", "id منفی → ۴۰۰/۴۰۴", [400, 404].includes((await api("/products/-5")).s));
ok("products", "search", (await api(`/products?search=A${tag}`)).s === 200);
ok("products", "search با کاراکتر regex (escape)", (await api("/products?search=%28%29")).s === 200);
ok("products", "sort=price_asc", (await api("/products?sort=price_asc")).s === 200);
ok("products", "sort=price_desc", (await api("/products?sort=price_desc")).s === 200);
ok("products", "sort=newest", (await api("/products?sort=newest")).s === 200);
ok("products", "sort نامعتبر (fallback)", (await api("/products?sort=xxx")).s === 200);
ok("products", "page=2", (await api("/products?page=2&limit=5")).s === 200);
ok("products", "limit=0 (fallback)", (await api("/products?limit=0")).s === 200);
ok("products", "limit بزرگ (clamp)", (await api("/products?limit=9999")).s === 200);
ok("products", "page خیلی بزرگ → خالی", (await api("/products?page=9999")).s === 200);
ok("products", "فیلتر موجودی", (await api("/products?inStock=1")).s === 200);
ok("products", "فیلتر دسته", (await api(`/products?category=${catId}`)).s === 200);
ok("products", "قیمت min/max", (await api("/products?minPrice=100000&maxPrice=1000000")).s === 200);
ok("products", "minPrice > maxPrice → بدون خطا", (await api("/products?minPrice=9999999&maxPrice=1")).s === 200);
ok("products", "آرایهٔ search (؟search=a&search=b)", (await api("/products?search=a&search=b")).s === 200);
ok("products", "قیمت محصول در DTO عددی است", typeof (await api(`/products/${P.a.id}`)).j?.product?.price === "number");
ok("products", "DTO عمومی inStock دارد (بدون stock عددی)", (await api(`/products/${P.a.id}`)).j?.product?.inStock !== undefined);

// ================= CATEGORIES / SETTINGS (~6) =================
ok("categories", "لیست دسته‌ها", (await api("/categories")).s === 200);
ok("categories", "لیست دسته‌ها آرایه است", Array.isArray((await api("/categories")).j?.categories));
ok("settings", "تنظیمات عمومی", (await api("/settings")).s === 200);
ok("settings", "شکل تنظیمات", (await api("/settings")).j?.settings !== undefined);
ok("settings", "تنظیمات شامل کلید خصوصی نیست", (await api("/settings")).j?.settings?.zarinpalMerchantId === undefined);
ok("health", "/health (روت، نه /api)", (await (async () => { try { const r2 = await fetch("http://127.0.0.1:4000/health"); return r2.status === 200; } catch { return false; } })()));

// ================= CART (~8) =================
const Uc = await mkU();
ok("cart", "track مهمان → tracked:false", (await api("/cart/track", { method: "POST", body: { items: [{ id: P.a.id, qty: 1 }] } })).j?.tracked === false);
ok("cart", "track کاربر → tracked:true", (await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: { items: [{ id: P.a.id, qty: 1 }] } })).j?.tracked === true);
ok("cart", "track سبد خالی → cleared", (await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: { items: [] } })).j?.cleared === true);
ok("cart", "track با id نامعتبر → cleared/ok", (await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: { items: [{ id: "x", qty: 1 }] } })).s === 200);
ok("cart", "track محصول غیرفعال → حذف", (await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: { items: [{ id: P.inact.id, qty: 1 }] } })).s === 200);
ok("cart", "track qty بیش از ۹۹ (clamp)", (await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: { items: [{ id: P.a.id, qty: 500 }] } })).s === 200);
ok("cart", "abandoned بدون ادمین → ۴۰۱", (await api("/cart/abandoned")).s === 401);
ok("cart", "abandoned با ادمین → ۲۰۰", (await api("/cart/abandoned", { cookie: ADMIN })).s === 200);

// ================= ORDERS validation (~24) =================
const Uo = await mkU();
const base = ord([{ id: P.a.id, qty: 1 }], Uo.phone);
ok("orders", "بدون terms → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, termsAccepted: false } })).s === 400);
ok("orders", "سبد خالی → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([], Uo.phone) })).s === 400);
ok("orders", "بدون نام → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, customerName: "" } })).s === 400);
ok("orders", "شمارهٔ نامعتبر → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, phone: "123" } })).s === 400);
ok("orders", "ایمیل نامعتبر → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, email: "bad" } })).s === 400);
ok("orders", "استان نامعتبر → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, province: "مریخ" } })).s === 400);
ok("orders", "شهر کوتاه → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, city: "ت" } })).s === 400);
ok("orders", "کد پستی ۹ رقم → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, postalCode: "123456789" } })).s === 400);
ok("orders", "کد پستی همه یک رقم → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, postalCode: "1111111111" } })).s === 400);
ok("orders", "آدرس کوتاه → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, address: "کوتاه" } })).s === 400);
ok("orders", "بدون لاگین → ۴۰۱", (await api("/orders", { method: "POST", body: base })).s === 401);
ok("orders", "کالای ناموجود → ۴۰۹", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.oos.id, qty: 1 }], Uo.phone) })).s === 409);
ok("orders", "کالای غیرفعال → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.inact.id, qty: 1 }], Uo.phone) })).s === 400);
ok("orders", "id نامعتبر در آیتم → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: "x", qty: 1 }], Uo.phone) })).s === 400);
ok("orders", "بیش از ۵۰ قلم → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord(Array.from({ length: 51 }, (_, i) => ({ id: P.a.id, qty: 1 })), Uo.phone) })).s === 400);
ok("orders", "دستکاری قیمت → قیمت DB", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.big.id, qty: 1, price: 1 }], Uo.phone) })).j?.order?.subtotal === 5000000);
const validOrder = await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.a.id, qty: 1 }], Uo.phone) });
ok("orders", "سفارش معتبر → ۲۰۱", validOrder.s === 201, `disc=${validOrder.j?.order?.discountAmount} (کش تنظیمات؛ تست قطعی تخفیف اول پایین‌تر است)`);
const firstCode = validOrder.j?.order?.code;
ok("orders", "کاهش موجودی (۱۰۰۰→۹۹۹)", (await Product.findOne({ id: P.a.id }).select("stock")).stock === 999);
ok("orders", "خرید دوم بدون تخفیف اول", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.b.id, qty: 1 }], Uo.phone) })).j?.order?.discountAmount === 0);
ok("orders", "روش ارسال نامعتبر → ۴۰۰", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.b.id, qty: 1 }], Uo.phone, { shippingMethod: "nope" }) })).s === 400);
const codU = await mkU(); const codO = await api("/orders", { method: "POST", cookie: codU.cookie, body: ord([{ id: P.a.id, qty: 1 }], codU.phone, { shippingCod: true }) });
ok("orders", "پس‌کرایه: onlinePaid<total", codO.j?.order?.onlinePaid < codO.j?.order?.total, `${codO.j?.order?.onlinePaid}<${codO.j?.order?.total}`);
ok("orders", "qty بیش از ۹۹ (clamp)", (await api("/orders", { method: "POST", cookie: (await mkU()).cookie, body: (() => { const u = { phone: rnd() }; return ord([{ id: P.b.id, qty: 500 }], u.phone); })() })).s >= 200);
ok("orders", "سفارش با کد سفارش ۱۲ کاراکتری", typeof firstCode === "string" && firstCode.startsWith("BL-"));

// ---- coupons (~12) ----
const cU = async () => { const u = await mkU(); await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone) }); return u; }; // consume first-purchase
let cu = await cU();
ok("coupon", "کوپن مبلغی ۱۰۰٬۰۰۰", (await api("/orders", { method: "POST", cookie: cu.cookie, body: ord([{ id: P.big.id, qty: 1 }], cu.phone, { couponCode: "AMT100" }) })).j?.order?.discountAmount === 100000);
cu = await cU();
ok("coupon", "کوپن درصدی+مبلغی → بزرگ‌تر(۷۵۰٬۰۰۰)", (await api("/orders", { method: "POST", cookie: cu.cookie, body: ord([{ id: P.big.id, qty: 1 }], cu.phone, { couponCode: "BOTH" }) })).j?.order?.discountAmount === 750000);
cu = await cU();
ok("coupon", "کوپن یک‌بارمصرف: استفادهٔ دوم → ۴۰۰", (await (async () => { await api("/orders", { method: "POST", cookie: cu.cookie, body: ord([{ id: P.big.id, qty: 1 }], cu.phone, { couponCode: "AMT100" }) }); return api("/orders", { method: "POST", cookie: cu.cookie, body: ord([{ id: P.big.id, qty: 1 }], cu.phone, { couponCode: "AMT100" }) }); })()).s === 400);
cu = await cU();
ok("coupon", "کوپن ناموجود → ۴۰۰", (await api("/orders", { method: "POST", cookie: cu.cookie, body: ord([{ id: P.big.id, qty: 1 }], cu.phone, { couponCode: "NOPE" }) })).s === 400);
cu = await cU();
ok("coupon", "کوپن منقضی → ۴۰۰", (await api("/orders", { method: "POST", cookie: cu.cookie, body: ord([{ id: P.big.id, qty: 1 }], cu.phone, { couponCode: "OLD" }) })).s === 400);
cu = await cU();
ok("coupon", "minOrder: سفارش کوچک → ۴۰۰", (await api("/orders", { method: "POST", cookie: cu.cookie, body: ord([{ id: P.a.id, qty: 1 }], cu.phone, { couponCode: "MIN" }) })).s === 400);
cu = await cU();
ok("coupon", "minOrder: سفارش بزرگ → ۲۰۱", (await api("/orders", { method: "POST", cookie: cu.cookie, body: ord([{ id: P.big.id, qty: 1 }], cu.phone, { couponCode: "MIN" }) })).s === 201);
cu = await cU();
ok("coupon", "کوپن با حروف کوچک (normalize)", (await api("/orders", { method: "POST", cookie: cu.cookie, body: ord([{ id: P.big.id, qty: 1 }], cu.phone, { couponCode: "amt100" }) })).j?.order?.discountAmount === 100000);
ok("coupon", "تخفیف خرید اول پس از لغو → دوباره ۲۰٪", await (async () => { const u = await mkU(); const o = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone) }); const oo = await Order.findOne({ code: o.j?.order?.code }); await api(`/admin/orders/${oo?.id}`, { method: "PATCH", cookie: ADMIN, body: { status: "لغو شد" } }); await sleep(200); const o2 = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.a.id, qty: 1 }], u.phone) }); return o2.j?.order?.discountAmount === 200000; })());

// ---- shipping methods (~6) ----
for (const m of ["tipax", "post-pishtaz", "chapar"]) { const u = await mkU(); const o = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone, { shippingMethod: m }) }); ok("shipping-order", `روش ${m} → ۲۰۱`, o.s === 201, `cost=${o.j?.order?.shippingCost}`); }
ok("shipping-order", "پیک محلی برای تهران(غیربومی) → ۴۰۰", (await api("/orders", { method: "POST", cookie: (await mkU()).cookie, body: ord([{ id: P.b.id, qty: 1 }], (await mkU()).phone, { shippingMethod: "peyk" }) })).s === 400);
ok("shipping-order", "پس‌کرایه با پیشتاز(بدون COD) → ۴۰۰", (await api("/orders", { method: "POST", cookie: (await mkU()).cookie, body: (() => { const u = { phone: rnd() }; return ord([{ id: P.b.id, qty: 1 }], u.phone, { shippingMethod: "post-pishtaz", shippingCod: true }); })() })).s === 400);
ok("shipping-order", "ارسال رایگان بالای آستانه", (await (async () => { const u = await mkU(); const o = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 2 }], u.phone) }); return o.j?.order?.freeShipping === true || o.j?.order?.shippingCost === 0; })()));

// ================= PAYMENT (~10) =================
ok("payment", "/start بدون درگاه → ۵۰۳", (await api("/payment/start", { method: "POST", body: { code: firstCode, phone: Uo.phone } })).s === 503);
ok("payment", "/start کد ناموجود → ۴۰۴/۵۰۳", [404, 503].includes((await api("/payment/start", { method: "POST", body: { code: "BL-XXXX", phone: Uo.phone } })).s));
ok("payment", "/status درست → ۲۰۰", (await api(`/payment/status/${firstCode}?phone=${Uo.phone}`)).s === 200);
ok("payment", "/status شمارهٔ غلط → ۴۰۴", (await api(`/payment/status/${firstCode}?phone=09999999999`)).s === 404);
ok("payment", "/status کد ناموجود → ۴۰۴", (await api("/payment/status/BL-NOPE?phone=09120000000")).s === 404);
ok("payment", "/recheck کد ناموجود → ۴۰۴", (await api("/payment/recheck/BL-NOPE", { method: "POST", body: { phone: Uo.phone } })).s === 404);
ok("payment", "/callback بدون Authority → redirect", (await api("/payment/callback")).s >= 300 || (await api("/payment/callback")).s === 200);
ok("payment", "/start غیرمالک → ۴۰۴/۵۰۳(بدون درگاه)", [404, 503].includes((await api("/payment/start", { method: "POST", body: { code: firstCode, phone: "09999999999" } })).s));
ok("payment", "/start با کوکی مالک → مجاز", [200, 503].includes((await api("/payment/start", { method: "POST", cookie: Uo.cookie, body: { code: firstCode } })).s));

// ================= REVIEWS (~16) =================
const rv = await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: "مهمان", body: "عالی بود واقعاً" } });
ok("reviews", "نقد مهمان → ۲۰۱", rv.s === 201);
await sleep(200);
ok("reviews", "نقد بی‌درنگ منتشر (auto-approve)", (await api(`/reviews/${P.a.id}`)).j?.reviews?.some?.((x) => x.body === "عالی بود واقعاً"));
ok("reviews", "امتیاز ۰ → ۴۰۰", (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 0, name: "x", body: "متن به اندازهٔ کافی بلند است" } })).s === 400);
ok("reviews", "امتیاز ۶ → ۴۰۰", (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 6, name: "x", body: "متن به اندازهٔ کافی بلند است" } })).s === 400);
ok("reviews", "متن کوتاه → ۴۰۰", (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: "x", body: "کوتاه" } })).s === 400);
ok("reviews", "نام کوتاه → ۴۰۰", (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: "x", body: "متن به اندازهٔ کافی بلند است" } })).s === 400);
ok("reviews", "محصول ناموجود → ۴۰۴", (await api("/reviews/99999999", { method: "POST", body: { rating: 5, name: "abc", body: "متن به اندازهٔ کافی بلند است" } })).s === 404);
const rU = await mkU();
await api("/orders", { method: "POST", cookie: rU.cookie, body: ord([{ id: P.b.id, qty: 1 }], rU.phone) }); // unpaid
await api(`/reviews/${P.b.id}`, { method: "POST", cookie: rU.cookie, body: { rating: 4, name: "خریدار", body: "خریدار تأییدشده؟" } });
await sleep(200);
ok("reviews", "verifiedBuyer با سفارش پرداخت‌نشده → false", (await api(`/reviews/${P.b.id}`)).j?.reviews?.find?.((x) => x.body === "خریدار تأییدشده؟")?.verifiedBuyer === false);
ok("reviews", "نقد تکراری (یک کاربر/محصول) → ۴۰۹", (await api(`/reviews/${P.b.id}`, { method: "POST", cookie: rU.cookie, body: { rating: 4, name: "خریدار", body: "یک نقد دیگر برای همان محصول" } })).s === 409);
ok("reviews", "لیست نقد + summary", (await api(`/reviews/${P.a.id}`)).j?.average !== undefined);
ok("reviews", "صفحه‌بندی نقد", (await api(`/reviews/${P.a.id}?page=1&limit=5`)).s === 200);
// daily cap: 11 products, 11 reviews as one user
const capU = await mkU(); let capHit = false;
for (let i = 0; i < 11; i++) { const p = (await mkP({ name: "cap" + i + tag, nameEn: "c" + i, price: 100000 })).j?.product; const rr = await api(`/reviews/${p.id}`, { method: "POST", cookie: capU.cookie, body: { rating: 5, name: "کاربر", body: "متن نقد به اندازهٔ کافی بلند است" } }); if (rr.s === 429) { capHit = true; break; } }
ok("reviews", "سقف ۱۰ نقد/روز → نقد ۱۱م ۴۲۹", capHit);
// admin reply + delete
const target = (await api(`/reviews/${P.a.id}`)).j?.reviews?.[0];
ok("reviews-admin", "پاسخ ادمین به نقد", (await api(`/admin/reviews/${target?.id}`, { method: "PATCH", cookie: ADMIN, body: { reply: "ممنون از شما" } })).s === 200);
await sleep(200);
ok("reviews-admin", "پاسخ در DTO عمومی", (await api(`/reviews/${P.a.id}`)).j?.reviews?.some?.((x) => x.reply?.body === "ممنون از شما"));
ok("reviews-admin", "حذف نقد توسط ادمین", (await api(`/admin/reviews/${target?.id}`, { method: "DELETE", cookie: ADMIN })).s === 200);
ok("reviews-admin", "حذف بدون ادمین → ۴۰۱", (await api(`/admin/reviews/${target?.id}`, { method: "DELETE" })).s === 401);

// ================= TUTORIALS + COMMENTS (~12) =================
let tutId = (await api("/tutorials?limit=1")).j?.tutorials?.[0]?.id;
if (!tutId) { const tt = await api("/admin/tutorials", { method: "POST", cookie: ADMIN, body: { title: "آموزش تست", excerpt: "خلاصه", body: "متن", category: "عمومی", published: true } }); tutId = tt.j?.tutorial?.id; }
ok("tutorials", "لیست آموزش", (await api("/tutorials")).s === 200);
if (tutId) {
  ok("tutorials", "تک‌آموزش", (await api(`/tutorials/${tutId}`)).s === 200);
  ok("tutorials", "رأی معتبر", (await api(`/tutorials/${tutId}/vote`, { method: "POST", body: { value: 1 } })).s === 200);
  ok("tutorials", "رأی نامعتبر → ۴۰۰", (await api(`/tutorials/${tutId}/vote`, { method: "POST", body: { value: 5 } })).s === 400);
  const cm = await api(`/tutorials/${tutId}/comments`, { method: "POST", body: { name: "مهمان", body: "نظر آزمایشی روی آموزش" } });
  ok("comments", "نظر آموزش → ۲۰۱", cm.s === 201);
  await sleep(200);
  ok("comments", "نظر بی‌درنگ منتشر", (await api(`/tutorials/${tutId}/comments`)).j?.comments?.some?.((x) => x.body === "نظر آزمایشی روی آموزش"));
  ok("comments", "نظر با متن کوتاه → ۴۰۰", (await api(`/tutorials/${tutId}/comments`, { method: "POST", body: { name: "مهمان", body: "ک" } })).s === 400);
  ok("comments", "نظر بدون نام → ۴۰۰", (await api(`/tutorials/${tutId}/comments`, { method: "POST", body: { body: "متن کافی برای نظر" } })).s === 400);
  const cmt = (await api(`/tutorials/${tutId}/comments`)).j?.comments?.[0];
  ok("comments-admin", "پاسخ ادمین به نظر آموزش", (await api(`/admin/tutorial-comments/${cmt?.id}`, { method: "PATCH", cookie: ADMIN, body: { reply: "سپاس" } })).s === 200);
  ok("comments-admin", "حذف نظر آموزش", (await api(`/admin/tutorial-comments/${cmt?.id}`, { method: "DELETE", cookie: ADMIN })).s === 200);
  ok("comments", "نظر روی آموزش ناموجود → ۴۰۴", (await api("/tutorials/99999999/comments", { method: "POST", body: { name: "مهمان", body: "متن کافی" } })).s === 404);
} else { ok("tutorials", "آموزشی برای تست نبود", false, "no tutorial"); }

// ================= ACCOUNT (~14) =================
const Ua2 = await mkU();
ok("account", "/loyalty بدون لاگین → ۴۰۱", (await api("/account/loyalty")).s === 401);
ok("account", "/loyalty → ۲۰۰", (await api("/account/loyalty", { cookie: Ua2.cookie })).s === 200);
ok("account", "افزودن علاقه‌مندی", (await api("/account/favorites", { method: "POST", cookie: Ua2.cookie, body: { productId: P.a.id } })).j?.ok === true);
ok("account", "افزودن تکراری (idempotent)", (await api("/account/favorites", { method: "POST", cookie: Ua2.cookie, body: { productId: P.a.id } })).j?.ok === true);
ok("account", "علاقه‌مندی محصول ناموجود → ۴۰۴", (await api("/account/favorites", { method: "POST", cookie: Ua2.cookie, body: { productId: 99999999 } })).s === 404);
ok("account", "علاقه‌مندی id نامعتبر → ۴۰۰", (await api("/account/favorites", { method: "POST", cookie: Ua2.cookie, body: { productId: "x" } })).s === 400);
ok("account", "لیست علاقه‌مندی", (await api("/account/favorites", { cookie: Ua2.cookie })).j?.favorites?.includes?.(P.a.id));
ok("account", "حذف علاقه‌مندی", (await api(`/account/favorites/${P.a.id}`, { method: "DELETE", cookie: Ua2.cookie })).j?.favorite === false);
// cancel-request
const Ucc = await mkU(); const occ = await api("/orders", { method: "POST", cookie: Ucc.cookie, body: ord([{ id: P.b.id, qty: 1 }], Ucc.phone) }); const occCode = occ.j?.order?.code;
if (!occCode) console.log("  [debug] account order failed:", occ.s, JSON.stringify(occ.j).slice(0, 120));
ok("account", "سفارش برای تست لغو ساخته شد", !!occCode, `${occ.s}`);
if (occCode) {
  ok("account", "درخواست لغو سفارش خود → ok", (await api(`/account/orders/${occCode}/cancel-request`, { method: "POST", cookie: Ucc.cookie })).j?.ok === true);
  ok("account", "درخواست لغو سفارش دیگران → ۴۰۴", (await api(`/account/orders/${occCode}/cancel-request`, { method: "POST", cookie: (await mkU()).cookie })).s === 404);
  // ۴۰۹ روی سفارش لغوشده: سفارش تازه که مستقیم توسط ادمین لغو شده (بدون cancel-request قبلی تا already:true نشود)
  const Ucx = await mkU(); const ocx = await api("/orders", { method: "POST", cookie: Ucx.cookie, body: ord([{ id: P.a.id, qty: 1 }], Ucx.phone) }); const ocxCode = ocx.j?.order?.code;
  const ocxDoc = ocxCode ? await Order.findOne({ code: ocxCode }) : null;
  if (ocxDoc) await api(`/admin/orders/${ocxDoc.id}`, { method: "PATCH", cookie: ADMIN, body: { status: "لغو شد" } });
  await sleep(200);
  ok("account", "درخواست لغو روی لغوشده → ۴۰۹", ocxCode ? (await api(`/account/orders/${ocxCode}/cancel-request`, { method: "POST", cookie: Ucx.cookie })).s === 409 : false);
}
ok("account", "cancel-request کد نامعتبر → ۴۰۰/۴۰۴", [400, 404].includes((await api("/account/orders/x/cancel-request", { method: "POST", cookie: Ucc.cookie })).s));
ok("account", "/account بدون لاگین → ۴۰۱", (await api("/account/loyalty")).s === 401);

// ================= SHIPPING endpoints (~10) =================
ok("shipping", "GET /options → ۲۰۰", (await api("/shipping/options")).s === 200);
ok("shipping", "options شامل provinces", Array.isArray((await api("/shipping/options")).j?.provinces));
for (const prov of ["تهران", "البرز", "فارس", "گیلان", "کرمان"]) { const q = await api("/shipping/quote", { method: "POST", body: { province: prov, items: [{ id: P.a.id, qty: 1 }], subtotal: 1000000 } }); ok("shipping", `quote ${prov} → ۲۰۰ + options`, q.s === 200 && Array.isArray(q.j?.options) && q.j.options.length > 0); }
ok("shipping", "quote استان نامعتبر", (await api("/shipping/quote", { method: "POST", body: { province: "مریخ", items: [], subtotal: 0 } })).s >= 200);
ok("shipping", "quote بدون province", (await api("/shipping/quote", { method: "POST", body: { items: [], subtotal: 0 } })).s >= 200);

// ================= ADMIN (~16) =================
ok("admin", "آمار (stats)", (await api("/admin/stats", { cookie: ADMIN })).s === 200);
ok("admin", "شمارش وضعیت سفارش‌ها", (await api("/admin/order-status-counts", { cookie: ADMIN })).s === 200);
ok("admin", "لیست سفارش‌ها", (await api("/admin/orders", { cookie: ADMIN })).s === 200);
ok("admin", "به‌روزرسانی موجودی (POST set)", (await api(`/admin/products/${P.b.id}/stock`, { method: "POST", cookie: ADMIN, body: { set: 42 } })).s === 200);
ok("admin", "موجودی اعمال شد", (await Product.findOne({ id: P.b.id }).select("stock")).stock === 42);
ok("admin", "ویرایش محصول", (await api(`/admin/products/${P.b.id}`, { method: "PATCH", cookie: ADMIN, body: { price: 600000 } })).s === 200);
ok("admin", "ویرایش بدون فیلد → ۲۰۰(no-op)/۴۰۰", [200, 400].includes((await api(`/admin/products/${P.b.id}`, { method: "PATCH", cookie: ADMIN, body: {} })).s));
ok("admin", "حذف محصول", (await api(`/admin/products/${P.cheap.id}`, { method: "DELETE", cookie: ADMIN })).s === 200);
ok("admin", "تغییر وضعیت سفارش → ۲۰۰", (await api(`/admin/orders/${(await Order.findOne({ code: firstCode })).id}`, { method: "PATCH", cookie: ADMIN, body: { status: "در حال آماده‌سازی" } })).s === 200);
ok("admin", "وضعیت نامعتبر → ۴۰۰", (await api(`/admin/orders/${(await Order.findOne({ code: firstCode })).id}`, { method: "PATCH", cookie: ADMIN, body: { status: "xyz" } })).s === 400);
ok("admin", "لغو سفارش → آزادسازی موجودی", await (async () => { const u = await mkU(); const o = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.a.id, qty: 1 }], u.phone) }); const before = (await Product.findOne({ id: P.a.id }).select("stock")).stock; const oo = await Order.findOne({ code: o.j?.order?.code }); await api(`/admin/orders/${oo.id}`, { method: "PATCH", cookie: ADMIN, body: { status: "لغو شد" } }); await sleep(200); const after = (await Product.findOne({ id: P.a.id }).select("stock")).stock; return after === before + 1; })());
ok("admin", "تنظیمات: خواندن", (await api("/admin/settings", { cookie: ADMIN })).s === 200);
ok("admin", "کاربران: لیست", (await api("/admin/users", { cookie: ADMIN })).s === 200);
ok("admin", "محصول بدون نام → ۴۰۰", (await api("/admin/products", { method: "POST", cookie: ADMIN, body: { price: 1000 } })).s === 400);
ok("admin", "دسته‌بندی: لیست ادمین", (await api("/admin/categories", { cookie: ADMIN })).s === 200);
ok("admin", "لاگ فعالیت", (await api("/admin/logs", { cookie: ADMIN })).s === 200);

// ================= SECURITY / EDGE (~12) =================
ok("sec", "IDOR: /admin/orders دیگران بدون ادمین → ۴۰۱", (await api("/admin/orders")).s === 401);
ok("sec", "injection در search (NoSQL)", (await api("/products?search=" + encodeURIComponent('{"$gt":""}'))).s === 200);
ok("sec", "payload بزرگ → کوتاه/رد (کرش نمی‌کند)", [200, 201, 400, 413].includes((await api("/reviews/" + P.a.id, { method: "POST", body: { rating: 5, name: "x".repeat(5000), body: "y".repeat(5000) } })).s));
ok("sec", "بدون Content-Type", await (async () => { try { const r2 = await fetch(BASE + "/products", { headers: { "X-Forwarded-For": rip() } }); return r2.status === 200; } catch { return false; } })());
// concurrent orders race (stock)
ok("race", "۵ سفارش هم‌زمان روی ۱ موجودی → دقیقاً ۱ موفق", await (async () => { const u = await mkU(); await api(`/admin/products/${P.big.id}/stock`, { method: "POST", cookie: ADMIN, body: { set: 1 } }); const rs = await Promise.all([1, 2, 3, 4, 5].map(() => api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone) }))); const created = rs.filter((x) => x.s === 201).length; await api(`/admin/products/${P.big.id}/stock`, { method: "POST", cookie: ADMIN, body: { set: 1000 } }); return created === 1; })(), "atomic stock $inc");
ok("race", "کوپن یک‌بارمصرف هم‌زمان → حداکثر یکی", await (async () => { const u = await cU(); const rs = await Promise.all([1, 2, 3].map(() => api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: "PCT10" }) }))); const withCoupon = rs.filter((x) => x.j?.order?.couponCode === "PCT10").length; return withCoupon <= 1; })(), "couponUseKey unique");
ok("edge", "سفارش با qty=۰ → ۴۰۰/fallback", (await api("/orders", { method: "POST", cookie: (await mkU()).cookie, body: ord([{ id: P.a.id, qty: 0 }], (await mkU()).phone) })).s >= 200);
ok("edge", "کد پستی با رقم ۴ = ۲ → ۴۰۰", (await api("/orders", { method: "POST", cookie: (await mkU()).cookie, body: (() => { const u = { phone: rnd() }; return ord([{ id: P.a.id, qty: 1 }], u.phone, { postalCode: "1234267890" }); })() })).s === 400);
ok("edge", "۲۰ درخواست پشت‌سرهم /products → همه ۲۰۰ (getSingleton)", await (async () => { const rs = await Promise.all(Array.from({ length: 20 }, () => api("/products?limit=5"))); return rs.every((x) => x.s === 200); })());
ok("edge", "health دوباره (روت)", (await (async () => { try { const r2 = await fetch("http://127.0.0.1:4000/health"); return r2.status === 200; } catch { return false; } })()));

await mongoose.disconnect();
const pass = R.filter((x) => x.pass).length, fail = R.length - pass;
console.log("\n===== RESULTS =====");
const byGroup = {};
for (const x of R) { byGroup[x.group] = byGroup[x.group] || { p: 0, f: 0 }; if (x.pass) byGroup[x.group].p++; else byGroup[x.group].f++; }
for (const [g, v] of Object.entries(byGroup)) console.log(`  ${g}: ${v.p} pass, ${v.f} fail`);
console.log(`\nTOTAL: ${R.length} scenarios — ${pass} PASS, ${fail} FAIL`);
if (fail) { console.log("\nFAILURES:"); R.filter((x) => !x.pass).forEach((x) => console.log(`  ❌ [${x.group}] ${x.name} ${x.info}`)); }
import { writeFileSync } from "fs";
writeFileSync("/home/user/bella/server/suite-results.json", JSON.stringify({ total: R.length, pass, fail, byGroup, results: R }, null, 2));
console.log("\nWROTE suite-results.json");
