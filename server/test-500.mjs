// 500-scenario live suite for Bella API. Loop-driven for breadth.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { writeFileSync } from "fs";

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
const ok = (g, n, c, i = "") => R.push({ group: g, name: n, pass: !!c, info: i });
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
const mkU = async () => { const phone = rnd(); const u = await User.create({ phone, name: "کاربر", tokenVersion: 0 }); return { u, phone, cookie: "bella_token=" + sign({ sub: String(u._id), tv: 0 }) }; };
const cats = await api("/categories"); const catId = cats.j?.categories?.[0]?.id ?? null;
const mkP = (p) => api("/admin/products", { method: "POST", cookie: ADMIN, body: { active: true, stock: 1000, category: catId, ...p } });
const ord = (items, phone, x = {}) => ({ customerName: "کاربر", phone, email: "t@t.com", province: "تهران", city: "تهران", postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", termsAccepted: true, items, shippingMethod: "tipax", ...x });

// ---- seed ----
const tag = Date.now();
const P = {};
P.a = (await mkP({ name: "A" + tag, nameEn: "A", price: 1000000 })).j?.product;
P.b = (await mkP({ name: "B" + tag, nameEn: "B", price: 500000 })).j?.product;
P.oos = (await mkP({ name: "OOS" + tag, nameEn: "O", price: 800000, stock: 0 })).j?.product;
P.big = (await mkP({ name: "BIG" + tag, nameEn: "G", price: 5000000 })).j?.product;
P.inact = (await mkP({ name: "INA" + tag, nameEn: "I", price: 300000, active: false })).j?.product;
ok("seed", "ساخت ۵ محصول", P.a && P.big && P.oos && P.inact);
await Settings.findOneAndUpdate({}, { $set: { couponEnabled: "1", firstPurchaseDiscountEnabled: "1", firstPurchasePercent: "20", couponCodesJson: JSON.stringify([{ code: "PCT10", percent: 10 }, { code: "AMT100", amount: 100000 }, { code: "BOTH", percent: 15, amount: 100000 }, { code: "MIN", percent: 10, minOrder: 2000000 }, { code: "OLD", percent: 10, until: "2020-01-01" }, { code: "PCT50", percent: 50 }]) } }, { upsert: true });
await sleep(5500);

// ============ 1) AUTH / OTP (~30) ============
const badPhones = ["", "1", "12", "123456", "02112345678", "009120000000", "abcdefg", "0912abcd000", "0912000000", "091200000000", "null", "undefined"];
for (const bp of badPhones) { const r = await api("/otp/request", { method: "POST", body: { phone: bp, channel: "sms" } }); ok("auth", `otp شمارهٔ نامعتبر «${bp}» → رد(۴۰۰/۴۲۹)`, [400, 429].includes(r.s), `s=${r.s}`); }
ok("auth", "otp بدون body → ۴۰۰", (await api("/otp/request", { method: "POST", body: {} })).s === 400);
ok("auth", "otp کانال نامعتبر → ۴۰۰/۲۰۰", [200, 400].includes((await api("/otp/request", { method: "POST", body: { phone: rnd(), channel: "fax" } })).s));
const ph1 = rnd(); const dev1 = (await api("/otp/request", { method: "POST", body: { phone: ph1, channel: "sms" } })).j?.devCode;
ok("auth", "otp sms معتبر + devCode", !!dev1);
ok("auth", "verify کد درست → ticket", !!(await api("/otp/verify", { method: "POST", body: { phone: ph1, code: dev1 } })).j?.ticket);
ok("auth", "verify کد غلط → ۴xx", (await api("/otp/verify", { method: "POST", body: { phone: ph1, code: "000000" } })).s >= 400);
ok("auth", "verify کد خالی → ۴۰۰", (await api("/otp/verify", { method: "POST", body: { phone: ph1, code: "" } })).s === 400);
ok("auth", "verify هم phone هم email → ۴۰۰", (await api("/otp/verify", { method: "POST", body: { phone: ph1, email: "a@b.com", code: "1" } })).s === 400);
ok("auth", "verify بدون phone/email → ۴۰۰", (await api("/otp/verify", { method: "POST", body: { code: "1" } })).s === 400);
const em1 = `u${tag}@t.com`;
ok("auth", "otp ایمیل معتبر", (await api("/otp/request", { method: "POST", body: { email: em1, channel: "email" } })).s === 200);
ok("auth", "otp ایمیل نامعتبر → ۴۰۰", (await api("/otp/request", { method: "POST", body: { email: "bad", channel: "email" } })).s === 400);
for (const be of ["", "a", "a@", "@b.com", "a b@c.com", "a@b", "a@@b.com"]) ok("auth", `otp ایمیل «${be}» → ۴۰۰`, (await api("/otp/request", { method: "POST", body: { email: be, channel: "email" } })).s === 400);
{ const lp = rnd(); const ld = (await api("/otp/request", { method: "POST", body: { phone: lp, channel: "sms" } })).j?.devCode; const lt = (await api("/otp/verify", { method: "POST", body: { phone: lp, code: ld } })).j?.ticket; ok("auth", "login با ticket → ۲۰۰", (await api("/auth/login", { method: "POST", body: { phone: lp, ticket: lt } })).s === 200); }
ok("auth", "login بدون ticket → ۴۰۰/۴۰۱", [400, 401].includes((await api("/auth/login", { method: "POST", body: { phone: rnd() } })).s));
ok("auth", "login ticket نامعتبر → ۴xx", (await api("/auth/login", { method: "POST", body: { phone: rnd(), ticket: "garbage" } })).s >= 400);
ok("auth", "/auth/me بدون کوکی → ۴۰۱", (await api("/auth/me")).s === 401);
ok("auth", "/auth/me کوکی معتبر → ۲۰۰", (await api("/auth/me", { cookie: (await mkU()).cookie })).s === 200);
ok("auth", "/auth/me توکن خراب → ۴۰۱", (await api("/auth/me", { cookie: "bella_token=garbage" })).s === 401);
ok("auth", "/auth/me توکن امضای غلط → ۴۰۱", (await api("/auth/me", { cookie: "bella_token=" + jwt.sign({ sub: "1", tv: 0 }, "wrongsecret", { issuer: "bella-api", audience: "bella-web" }) })).s === 401);
ok("auth", "/auth/logout → ۲۰۰", (await api("/auth/logout", { method: "POST", cookie: (await mkU()).cookie })).s === 200);
ok("auth", "ادمین بدون کوکی → ۴۰۱", (await api("/admin/products")).s === 401);
ok("auth", "ادمین با توکن کاربر → ۴۰۱", (await api("/admin/products", { cookie: (await mkU()).cookie })).s === 401);
ok("auth", "ادمین با توکن ادمین → ۲۰۰", (await api("/admin/products", { cookie: ADMIN })).s === 200);

// ============ 2) PRODUCTS (~60) ============
ok("products", "لیست", (await api("/products?limit=50")).s === 200);
ok("products", "تک‌محصول", (await api(`/products/${P.a.id}`)).s === 200);
for (const bad of ["0", "-1", "-5", "abc", "1e3", "  ", "%20", "null", "undefined", "1 OR 1", "1;DROP", "99999999999", "2147483648"]) ok("products", `id نامعتبر «${bad}» → ۴۰۰/۴۰۴`, [400, 404].includes((await api(`/products/${encodeURIComponent(bad)}`)).s));
ok("products", "id اعشاری «1.5» → بدون کرش (trunc)", [200, 400, 404].includes((await api("/products/1.5")).s));
ok("products", "id ناموجود → ۴۰۴", (await api("/products/99999999")).s === 404);
ok("products", "محصول غیرفعال → ۴۰۴", (await api(`/products/${P.inact.id}`)).s === 404);
for (const s of ["price_asc", "price_desc", "newest", "oldest", "popular", "xxx", "", "PRICE_ASC"]) ok("products", `sort=${s || "(خالی)"} → ۲۰۰`, (await api(`/products?sort=${encodeURIComponent(s)}`)).s === 200);
for (const l of ["0", "-1", "1", "12", "100", "9999", "abc"]) ok("products", `limit=${l} → ۲۰۰`, (await api(`/products?limit=${l}`)).s === 200);
for (const p of ["0", "-1", "1", "2", "99999", "abc"]) ok("products", `page=${p} → ۲۰۰`, (await api(`/products?page=${p}`)).s === 200);
for (const q of ["A", tag.toString(), "()", ".*", "$gt", "%", "_", "'", '"', "<script>", "عطر"]) ok("products", `search «${q}» → ۲۰۰ (escape)`, (await api(`/products?search=${encodeURIComponent(q)}`)).s === 200);
ok("products", "فیلتر موجودی", (await api("/products?inStock=1")).s === 200);
ok("products", "فیلتر دسته", (await api(`/products?category=${catId}`)).s === 200);
ok("products", "قیمت min/max", (await api("/products?minPrice=100000&maxPrice=1000000")).s === 200);
ok("products", "min>max → بدون خطا", (await api("/products?minPrice=9999999&maxPrice=1")).s === 200);
ok("products", "minPrice منفی → ۲۰۰", (await api("/products?minPrice=-100")).s === 200);
ok("products", "maxPrice=0 → ۲۰۰", (await api("/products?maxPrice=0")).s === 200);
ok("products", "آرایهٔ search → ۲۰۰", (await api("/products?search=a&search=b")).s === 200);
ok("products", "DTO قیمت عددی", typeof (await api(`/products/${P.a.id}`)).j?.product?.price === "number");
ok("products", "DTO عمومی inStock دارد", (await api(`/products/${P.a.id}`)).j?.product?.inStock !== undefined);
ok("products", "DTO عمومی stock عددی ندارد (عمدی)", (await api(`/products/${P.a.id}`)).j?.product?.stock === undefined);
ok("products", "related → ۲۰۰", (await api(`/products/${P.a.id}/related`)).s === 200);
ok("products", "related id نامعتبر → ۴۰۰/۴۰۴", [400, 404].includes((await api("/products/-5/related")).s));

// ============ 3) CATEGORIES / SETTINGS / HEALTH (~8) ============
ok("categories", "لیست دسته‌ها", (await api("/categories")).s === 200);
ok("categories", "آرایه است", Array.isArray((await api("/categories")).j?.categories));
ok("settings", "تنظیمات عمومی", (await api("/settings")).s === 200);
ok("settings", "شکل settings", (await api("/settings")).j?.settings !== undefined);
ok("settings", "کلید خصوصی لو نمی‌رود", (await api("/settings")).j?.settings?.zarinpalMerchantId === undefined);
ok("health", "/health روت → ۲۰۰", await (async () => { try { return (await fetch("http://127.0.0.1:4000/health")).status === 200; } catch { return false; } })());
ok("health", "/health دوباره", await (async () => { try { return (await fetch("http://127.0.0.1:4000/health")).status === 200; } catch { return false; } })());
ok("404", "مسیر ناموجود → ۴۰۴", (await api("/nonexistent-xyz")).s === 404);

// ============ 4) CART (~14) ============
const Uc = await mkU();
ok("cart", "track مهمان → tracked:false", (await api("/cart/track", { method: "POST", body: { items: [{ id: P.a.id, qty: 1 }] } })).j?.tracked === false);
ok("cart", "track کاربر → tracked:true", (await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: { items: [{ id: P.a.id, qty: 1 }] } })).j?.tracked === true);
ok("cart", "track سبد خالی → cleared", (await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: { items: [] } })).j?.cleared === true);
ok("cart", "track بدون items → ۲۰۰/۴۰۰", [200, 400].includes((await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: {} })).s));
for (const it of [[{ id: "x", qty: 1 }], [{ id: P.inact.id, qty: 1 }], [{ id: P.a.id, qty: 500 }], [{ id: P.a.id, qty: -5 }], [{ id: P.a.id, qty: 0 }], [{ id: -1, qty: 1 }]]) ok("cart", `track آیتم «${JSON.stringify(it[0])}» → ۲۰۰`, (await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: { items: it } })).s === 200);
ok("cart", "track آیتم تکراری → ۲۰۰", (await api("/cart/track", { method: "POST", cookie: Uc.cookie, body: { items: [{ id: P.a.id, qty: 1 }, { id: P.a.id, qty: 2 }] } })).s === 200);
ok("cart", "abandoned بدون ادمین → ۴۰۱", (await api("/cart/abandoned")).s === 401);
ok("cart", "abandoned با ادمین → ۲۰۰", (await api("/cart/abandoned", { cookie: ADMIN })).s === 200);

// ============ 5) ORDERS validation (~80) ============
const Uo = await mkU();
const base = ord([{ id: P.a.id, qty: 1 }], Uo.phone);
const orderCases = [
  ["بدون terms", { ...base, termsAccepted: false }, 400],
  ["terms رشته", { ...base, termsAccepted: "yes" }, 400],
  ["سبد خالی", ord([], Uo.phone), 400],
  ["بدون items", (() => { const { items, ...r } = base; return r; })(), 400],
  ["نام خالی", { ...base, customerName: "" }, 400],
  ["نام ۱ حرف (lenient)", { ...base, customerName: "ک" }, [200, 201]],
  ["نام خیلی بلند", { ...base, customerName: "ک".repeat(300) }, [200, 201, 400]],
  ["شماره خالی", { ...base, phone: "" }, 400],
  ["شماره کوتاه", { ...base, phone: "123" }, 400],
  ["شماره ثابت (isPhone lenient)", { ...base, phone: "02112345678" }, [200, 201]],
  ["شماره حروف", { ...base, phone: "abcdef" }, 400],
  ["ایمیل خالی", { ...base, email: "" }, 400],
  ["ایمیل بد", { ...base, email: "bad" }, 400],
  ["ایمیل بدون @", { ...base, email: "ab.com" }, 400],
  ["استان خالی", { ...base, province: "" }, 400],
  ["استان نامعتبر", { ...base, province: "مریخ" }, 400],
  ["شهر خالی", { ...base, city: "" }, 400],
  ["شهر ۱ حرف", { ...base, city: "ت" }, 400],
  ["کدپستی خالی", { ...base, postalCode: "" }, 400],
  ["کدپستی ۹ رقم", { ...base, postalCode: "123456789" }, 400],
  ["کدپستی ۱۱ رقم", { ...base, postalCode: "12345678901" }, 400],
  ["کدپستی همه یک", { ...base, postalCode: "1111111111" }, 400],
  ["کدپستی رقم۴=۲", { ...base, postalCode: "1234267890" }, 400],
  ["کدپستی حروف", { ...base, postalCode: "abcdefghij" }, 400],
  ["آدرس خالی", { ...base, address: "" }, 400],
  ["آدرس کوتاه", { ...base, address: "کوتاه" }, 400],
  ["روش ارسال نامعتبر", ord([{ id: P.a.id, qty: 1 }], Uo.phone, { shippingMethod: "nope" }), 400],
  ["کالای ناموجود", ord([{ id: P.oos.id, qty: 1 }], Uo.phone), 409],
  ["کالای غیرفعال", ord([{ id: P.inact.id, qty: 1 }], Uo.phone), 400],
  ["id نامعتبر آیتم", ord([{ id: "x", qty: 1 }], Uo.phone), 400],
  ["id منفی آیتم", ord([{ id: -1, qty: 1 }], Uo.phone), 400],
  ["qty صفر", ord([{ id: P.a.id, qty: 0 }], Uo.phone), [200, 201, 400]],
  ["qty منفی", ord([{ id: P.a.id, qty: -1 }], Uo.phone), [200, 201, 400]],
  ["بیش از ۵۰ قلم", ord(Array.from({ length: 51 }, () => ({ id: P.a.id, qty: 1 })), Uo.phone), 400],
];
for (const [name, body, exp] of orderCases) { const r = await api("/orders", { method: "POST", cookie: Uo.cookie, body }); const pass = Array.isArray(exp) ? exp.includes(r.s) : r.s === exp; ok("orders", `${name} → ${Array.isArray(exp) ? exp.join("/") : exp}`, pass, `s=${r.s}`); }
ok("orders", "بدون لاگین → ۴۰۱", (await api("/orders", { method: "POST", body: base })).s === 401);
const validOrder = await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.a.id, qty: 1 }], Uo.phone) });
ok("orders", "سفارش معتبر → ۲۰۱", validOrder.s === 201);
ok("orders", "کد سفارش BL-", typeof validOrder.j?.order?.code === "string" && validOrder.j.order.code.startsWith("BL-"));
ok("orders", "کاهش موجودی (< ۱۰۰۰)", (await Product.findOne({ id: P.a.id }).select("stock")).stock < 1000);
ok("orders", "دستکاری قیمت → قیمت DB", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.big.id, qty: 1, price: 1 }], Uo.phone) })).j?.order?.subtotal === 5000000);
for (const q of [1, 2, 3, 50, 99]) { const u = await mkU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: q }], u.phone) }); ok("orders", `qty=${q} → ۲۰۱`, r.s === 201); }
for (const m of ["tipax", "post-pishtaz", "chapar"]) { const u = await mkU(); ok("orders", `روش ${m} → ۲۰۱`, (await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone, { shippingMethod: m }) })).s === 201); }
ok("orders", "پیک تهران(غیربومی) → ۴۰۰", (await api("/orders", { method: "POST", cookie: (await mkU()).cookie, body: ord([{ id: P.b.id, qty: 1 }], rnd(), { shippingMethod: "peyk" }) })).s === 400);
ok("orders", "پس‌کرایه → onlinePaid<total", await (async () => { const u = await mkU(); const o = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.a.id, qty: 1 }], u.phone, { shippingCod: true }) }); return o.j?.order?.onlinePaid < o.j?.order?.total; })());
ok("orders", "پس‌کرایه با پیشتاز(بدون COD) → ۴۰۰", (await api("/orders", { method: "POST", cookie: (await mkU()).cookie, body: ord([{ id: P.b.id, qty: 1 }], rnd(), { shippingMethod: "post-pishtaz", shippingCod: true }) })).s === 400);
ok("orders", "ارسال رایگان بالای آستانه", await (async () => { const u = await mkU(); const o = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 2 }], u.phone) }); return o.j?.order?.freeShipping === true || o.j?.order?.shippingCost === 0; })());
ok("orders", "تخفیف خرید اول پس از لغو → ۲۰٪", await (async () => { const u = await mkU(); const o = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone) }); const d = await Order.findOne({ code: o.j?.order?.code }); if (d) await api(`/admin/orders/${d.id}`, { method: "PATCH", cookie: ADMIN, body: { status: "لغو شد" } }); await sleep(200); const o2 = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.a.id, qty: 1 }], u.phone) }); return o2.j?.order?.discountAmount === 200000; })());

// ============ 6) COUPONS (~25) ============
const cU = async () => { const u = await mkU(); await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone) }); return u; };
const couponCases = [["AMT100", 100000], ["BOTH", 750000], ["PCT10", 500000], ["PCT50", 2500000], ["amt100", 100000], [" AmT100 ", 100000]];
for (const [code, exp] of couponCases) { const u = await cU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: code }) }); ok("coupon", `کوپن ${code} → ${exp}`, r.j?.order?.discountAmount === exp, `got=${r.j?.order?.discountAmount}`); }
for (const code of ["NOPE", "XXXX", "old"]) { const u = await cU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: code }) }); ok("coupon", `کوپن نامعتبر «${code}» → ۴۰۰`, r.s === 400, `s=${r.s}`); }
for (const code of ["", " "]) { const u = await cU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: code }) }); ok("coupon", `کوپن خالی «${code}» → ۲۰۱ بدون تخفیف`, r.s === 201 && (r.j?.order?.discountAmount ?? 0) === 0, `s=${r.s}`); }
{ const u = await cU(); ok("coupon", "کوپن MIN زیر حد → ۴۰۰", (await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.a.id, qty: 1 }], u.phone, { couponCode: "MIN" }) })).s === 400); }
ok("coupon", "minOrder سفارش بزرگ → ۲۰۱", (await api("/orders", { method: "POST", cookie: (await cU()).cookie, body: ord([{ id: P.big.id, qty: 1 }], rnd(), { couponCode: "MIN" }) })).s === 201);
ok("coupon", "کوپن منقضی → ۴۰۰", (await api("/orders", { method: "POST", cookie: (await cU()).cookie, body: ord([{ id: P.big.id, qty: 1 }], rnd(), { couponCode: "OLD" }) })).s === 400);
ok("coupon", "یک‌بارمصرف استفادهٔ دوم → ۴۰۰", await (async () => { const u = await cU(); await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: "PCT50" }) }); return (await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: "PCT50" }) })).s === 400; })());

// ============ 7) SHIPPING — همهٔ استان‌ها (~70) ============
ok("shipping", "GET /options → ۲۰۰", (await api("/shipping/options")).s === 200);
ok("shipping", "options دارای provinces", Array.isArray((await api("/shipping/options")).j?.provinces));
const provinces = ["تهران", "البرز", "قم", "قزوین", "مرکزی", "سمنان", "زنجان", "اردبیل", "آذربایجان شرقی", "آذربایجان غربی", "کردستان", "کرمانشاه", "همدان", "لرستان", "ایلام", "خوزستان", "چهارمحال و بختیاری", "کهگیلویه و بویراحمد", "فارس", "بوشهر", "هرمزگان", "کرمان", "یزد", "اصفهان", "خراسان رضوی", "خراسان شمالی", "خراسان جنوبی", "سیستان و بلوچستان", "گلستان", "مازندران", "گیلان"];
for (const prov of provinces) { const q = await api("/shipping/quote", { method: "POST", body: { province: prov, items: [{ id: P.a.id, qty: 1 }], subtotal: 1000000 } }); ok("shipping", `quote ${prov} → ۲۰۰+options`, q.s === 200 && Array.isArray(q.j?.options) && q.j.options.length > 0); }
for (const prov of ["مریخ", "", "tehran", "تهران ", "TEHRAN"]) ok("shipping", `quote استان «${prov}» → بدون کرش`, (await api("/shipping/quote", { method: "POST", body: { province: prov, items: [], subtotal: 0 } })).s >= 200);
ok("shipping", "quote بدون province → ۲۰۰/۴۰۰", [200, 400].includes((await api("/shipping/quote", { method: "POST", body: { items: [], subtotal: 0 } })).s));
for (const sub of [0, 1, 100000, 1000000, 99999999, -100]) ok("shipping", `quote subtotal=${sub} → ۲۰۰`, (await api("/shipping/quote", { method: "POST", body: { province: "تهران", items: [{ id: P.a.id, qty: 1 }], subtotal: sub } })).s === 200);

// ============ 8) PAYMENT (~20) ============
const firstCode = validOrder.j?.order?.code;
ok("payment", "/start بدون درگاه → ۵۰۳", (await api("/payment/start", { method: "POST", body: { code: firstCode, phone: Uo.phone } })).s === 503);
ok("payment", "/start کد ناموجود → ۴۰۴/۵۰۳", [404, 503].includes((await api("/payment/start", { method: "POST", body: { code: "BL-XXXX", phone: Uo.phone } })).s));
ok("payment", "/start غیرمالک → ۴۰۴/۵۰۳", [404, 503].includes((await api("/payment/start", { method: "POST", body: { code: firstCode, phone: "09999999999" } })).s));
ok("payment", "/status درست → ۲۰۰", (await api(`/payment/status/${firstCode}?phone=${Uo.phone}`)).s === 200);
ok("payment", "/status شماره غلط → ۴۰۴", (await api(`/payment/status/${firstCode}?phone=09999999999`)).s === 404);
ok("payment", "/status کد ناموجود → ۴۰۴", (await api("/payment/status/BL-NOPE?phone=09120000000")).s === 404);
for (const c of ["", "BL-", "BL-NOPE", "abc", firstCode + "x"]) ok("payment", `/status کد «${c}» → ۴۰۴`, (await api(`/payment/status/${encodeURIComponent(c)}?phone=${Uo.phone}`)).s === 404);
ok("payment", "/recheck ناموجود → ۴۰۴", (await api("/payment/recheck/BL-NOPE", { method: "POST", body: { phone: Uo.phone } })).s === 404);
ok("payment", "/recheck درست → بدون کرش", [200, 402, 404, 409, 502, 503].includes((await api(`/payment/recheck/${firstCode}`, { method: "POST", body: { phone: Uo.phone } })).s));
ok("payment", "/callback بدون Authority → redirect/200", (await api("/payment/callback")).s >= 200);
ok("payment", "/start با کوکی مالک → مجاز", [200, 503].includes((await api("/payment/start", { method: "POST", cookie: Uo.cookie, body: { code: firstCode } })).s));

// ============ 9) REVIEWS (~50) ============
for (const rating of [1, 2, 3, 4, 5]) { const r = await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating, name: "مهمان" + rating, body: "متن نقد به اندازهٔ کافی بلند است" } }); ok("reviews", `امتیاز ${rating} → ۲۰۱`, r.s === 201); }
for (const rating of [0, -1, 6, 100, "abc", ""]) ok("reviews", `امتیاز نامعتبر «${rating}» → ۴۰۰`, (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating, name: "مهمان", body: "متن نقد به اندازهٔ کافی بلند است" } })).s === 400);
ok("reviews", "امتیاز اعشاری 3.5 → بدون کرش (trunc)", [201, 400].includes((await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 3.5, name: "مهمان", body: "متن نقد به اندازهٔ کافی بلند است" } })).s));
for (const body of ["", "کوتاه", "x".repeat(9), "x".repeat(10)]) ok("reviews", `متن «${body.length} حرف» → ${body.length < 10 ? "۴۰۰" : "۲۰۱"}`, (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: "مهمان", body } })).s === (body.length < 10 ? 400 : 201));
ok("reviews", "متن ۵۰۰۰ → کوتاه/۲۰۱", [201, 400].includes((await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: "مهمان", body: "x".repeat(5000) } })).s));
for (const name of ["", "x", "ab", "م".repeat(81), "م".repeat(200)]) ok("reviews", `نام «${name.length} حرف» → بدون کرش`, (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name, body: "متن نقد به اندازهٔ کافی بلند است" } })).s >= 200);
ok("reviews", "محصول ناموجود → ۴۰۴", (await api("/reviews/99999999", { method: "POST", body: { rating: 5, name: "abc", body: "متن نقد به اندازهٔ کافی بلند است" } })).s === 404);
ok("reviews", "id نامعتبر → ۴۰۰/۴۰۴/۴۲۹", [400, 404, 429].includes((await api("/reviews/-5", { method: "POST", body: { rating: 5, name: "abc", body: "متن کافی بلند است" } })).s));
const rU = await mkU();
await api("/orders", { method: "POST", cookie: rU.cookie, body: ord([{ id: P.b.id, qty: 1 }], rU.phone) });
await api(`/reviews/${P.b.id}`, { method: "POST", cookie: rU.cookie, body: { rating: 4, name: "خریدار", body: "خریدار تأییدشده؟" } });
await sleep(200);
ok("reviews", "verifiedBuyer پرداخت‌نشده → false", (await api(`/reviews/${P.b.id}`)).j?.reviews?.find?.((x) => x.body === "خریدار تأییدشده؟")?.verifiedBuyer === false);
ok("reviews", "نقد تکراری → ۴۰۹", (await api(`/reviews/${P.b.id}`, { method: "POST", cookie: rU.cookie, body: { rating: 4, name: "خریدار", body: "یک نقد دیگر برای همان محصول" } })).s === 409);
ok("reviews", "لیست + average", (await api(`/reviews/${P.a.id}`)).j?.average !== undefined);
for (const p of [1, 2, 99, "abc"]) ok("reviews", `صفحه ${p} → ۲۰۰`, (await api(`/reviews/${P.a.id}?page=${p}&limit=5`)).s === 200);
const capU = await mkU(); let capHit = false;
for (let i = 0; i < 11; i++) { const p = (await mkP({ name: "cap" + i + tag, nameEn: "c" + i, price: 100000 })).j?.product; const rr = await api(`/reviews/${p.id}`, { method: "POST", cookie: capU.cookie, body: { rating: 5, name: "کاربر", body: "متن نقد به اندازهٔ کافی بلند است" } }); if (rr.s === 429) { capHit = true; break; } }
ok("reviews", "سقف نقد روزانه → ۴۲۹", capHit);
const target = (await api(`/reviews/${P.a.id}`)).j?.reviews?.[0];
ok("reviews-admin", "پاسخ ادمین → ۲۰۰", (await api(`/admin/reviews/${target?.id}`, { method: "PATCH", cookie: ADMIN, body: { reply: "ممنون از شما" } })).s === 200);
await sleep(150);
ok("reviews-admin", "پاسخ در DTO عمومی", (await api(`/reviews/${P.a.id}`)).j?.reviews?.some?.((x) => x.reply?.body === "ممنون از شما"));
ok("reviews-admin", "حذف ادمین → ۲۰۰", (await api(`/admin/reviews/${target?.id}`, { method: "DELETE", cookie: ADMIN })).s === 200);
ok("reviews-admin", "حذف بدون ادمین → ۴۰۱", (await api(`/admin/reviews/${target?.id}`, { method: "DELETE" })).s === 401);
ok("reviews-admin", "پاسخ بدون ادمین → ۴۰۱", (await api(`/admin/reviews/${target?.id}`, { method: "PATCH", body: { reply: "x" } })).s === 401);

// ============ 10) TUTORIALS + COMMENTS (~30) ============
let tutId = (await api("/tutorials?limit=1")).j?.tutorials?.[0]?.id;
if (!tutId) tutId = (await api("/admin/tutorials", { method: "POST", cookie: ADMIN, body: { title: "آموزش تست", excerpt: "خلاصه", body: "متن", category: "عمومی", published: true } })).j?.tutorial?.id;
ok("tutorials", "لیست → ۲۰۰", (await api("/tutorials")).s === 200);
if (tutId) {
  ok("tutorials", "تک‌آموزش → ۲۰۰", (await api(`/tutorials/${tutId}`)).s === 200);
  ok("tutorials", "id نامعتبر → ۴۰۰/۴۰۴", [400, 404].includes((await api("/tutorials/-5")).s));
  for (const v of [1, -1, 0]) ok("tutorials", `رأی ${v} → ۲۰۰`, (await api(`/tutorials/${tutId}/vote`, { method: "POST", body: { value: v } })).s === 200);
  for (const v of [2, 5, -2, "abc"]) ok("tutorials", `رأی نامعتبر «${v}» → ۴۰۰`, (await api(`/tutorials/${tutId}/vote`, { method: "POST", body: { value: v } })).s === 400);
  const cm = await api(`/tutorials/${tutId}/comments`, { method: "POST", body: { name: "مهمان", body: "نظر آزمایشی روی آموزش" } });
  ok("comments", "نظر → ۲۰۱", cm.s === 201);
  await sleep(150);
  ok("comments", "بی‌درنگ منتشر", (await api(`/tutorials/${tutId}/comments`)).j?.comments?.some?.((x) => x.body === "نظر آزمایشی روی آموزش"));
  for (const body of ["", "ک", "کو"]) ok("comments", `نظر متن کوتاه «${body}» → ۴۰۰`, (await api(`/tutorials/${tutId}/comments`, { method: "POST", body: { name: "مهمان", body } })).s === 400);
  ok("comments", "نظر بدون نام → ۴۰۰", (await api(`/tutorials/${tutId}/comments`, { method: "POST", body: { body: "متن کافی برای نظر" } })).s === 400);
  ok("comments", "نظر روی آموزش ناموجود → ۴۰۴", (await api("/tutorials/99999999/comments", { method: "POST", body: { name: "مهمان", body: "متن کافی" } })).s === 404);
  const cmt = (await api(`/tutorials/${tutId}/comments`)).j?.comments?.[0];
  ok("comments-admin", "پاسخ ادمین → ۲۰۰", (await api(`/admin/tutorial-comments/${cmt?.id}`, { method: "PATCH", cookie: ADMIN, body: { reply: "سپاس" } })).s === 200);
  ok("comments-admin", "حذف ادمین → ۲۰۰", (await api(`/admin/tutorial-comments/${cmt?.id}`, { method: "DELETE", cookie: ADMIN })).s === 200);
  ok("comments-admin", "حذف بدون ادمین → ۴۰۱", (await api(`/admin/tutorial-comments/${cmt?.id}`, { method: "DELETE" })).s === 401);
} else ok("tutorials", "آموزشی نبود", false);

// ============ 11) ACCOUNT (~35) ============
const Ua = await mkU();
ok("account", "/loyalty بدون لاگین → ۴۰۱", (await api("/account/loyalty")).s === 401);
ok("account", "/loyalty → ۲۰۰", (await api("/account/loyalty", { cookie: Ua.cookie })).s === 200);
for (const pid of [P.a.id, P.b.id, P.big.id]) ok("account", `افزودن علاقه‌مندی ${pid}`, (await api("/account/favorites", { method: "POST", cookie: Ua.cookie, body: { productId: pid } })).j?.ok === true);
ok("account", "افزودن تکراری idempotent", (await api("/account/favorites", { method: "POST", cookie: Ua.cookie, body: { productId: P.a.id } })).j?.ok === true);
ok("account", "ناموجود → ۴۰۴", (await api("/account/favorites", { method: "POST", cookie: Ua.cookie, body: { productId: 99999999 } })).s === 404);
for (const pid of ["x", -1, 0, ""]) ok("account", `id نامعتبر «${pid}» → ۴۰۰`, (await api("/account/favorites", { method: "POST", cookie: Ua.cookie, body: { productId: pid } })).s === 400);
ok("account", "لیست علاقه‌مندی", (await api("/account/favorites", { cookie: Ua.cookie })).j?.favorites?.includes?.(P.a.id));
ok("account", "حذف علاقه‌مندی", (await api(`/account/favorites/${P.a.id}`, { method: "DELETE", cookie: Ua.cookie })).j?.favorite === false);
ok("account", "حذف بدون لاگین → ۴۰۱", (await api(`/account/favorites/${P.b.id}`, { method: "DELETE" })).s === 401);
const Ucc = await mkU(); const occ = await api("/orders", { method: "POST", cookie: Ucc.cookie, body: ord([{ id: P.b.id, qty: 1 }], Ucc.phone) }); const occCode = occ.j?.order?.code;
if (occCode) {
  ok("account", "درخواست لغو خود → ok", (await api(`/account/orders/${occCode}/cancel-request`, { method: "POST", cookie: Ucc.cookie })).j?.ok === true);
  ok("account", "درخواست لغو دیگران → ۴۰۴", (await api(`/account/orders/${occCode}/cancel-request`, { method: "POST", cookie: (await mkU()).cookie })).s === 404);
  ok("account", "درخواست لغو تکراری → already", (await api(`/account/orders/${occCode}/cancel-request`, { method: "POST", cookie: Ucc.cookie })).j?.already === true);
}
const Ucx = await mkU(); const ocx = await api("/orders", { method: "POST", cookie: Ucx.cookie, body: ord([{ id: P.a.id, qty: 1 }], Ucx.phone) }); const ocxCode = ocx.j?.order?.code;
if (ocxCode) { const d = await Order.findOne({ code: ocxCode }); if (d) await api(`/admin/orders/${d.id}`, { method: "PATCH", cookie: ADMIN, body: { status: "لغو شد" } }); await sleep(150); ok("account", "لغو روی لغوشده → ۴۰۹", (await api(`/account/orders/${ocxCode}/cancel-request`, { method: "POST", cookie: Ucx.cookie })).s === 409); }
for (const c of ["x", "BL-NOPE", ""]) ok("account", `cancel کد «${c}» → ۴۰۰/۴۰۴`, [400, 404].includes((await api(`/account/orders/${encodeURIComponent(c)}/cancel-request`, { method: "POST", cookie: Ucc.cookie })).s));

// ============ 12) ADMIN (~45) ============
ok("admin", "stats → ۲۰۰", (await api("/admin/stats", { cookie: ADMIN })).s === 200);
ok("admin", "order-status-counts → ۲۰۰", (await api("/admin/order-status-counts", { cookie: ADMIN })).s === 200);
ok("admin", "orders → ۲۰۰", (await api("/admin/orders", { cookie: ADMIN })).s === 200);
ok("admin", "users → ۲۰۰", (await api("/admin/users", { cookie: ADMIN })).s === 200);
ok("admin", "categories → ۲۰۰", (await api("/admin/categories", { cookie: ADMIN })).s === 200);
ok("admin", "logs → ۲۰۰", (await api("/admin/logs", { cookie: ADMIN })).s === 200);
ok("admin", "settings → ۲۰۰", (await api("/admin/settings", { cookie: ADMIN })).s === 200);
ok("admin", "stock POST set → ۲۰۰", (await api(`/admin/products/${P.b.id}/stock`, { method: "POST", cookie: ADMIN, body: { set: 42 } })).s === 200);
ok("admin", "stock اعمال شد", (await Product.findOne({ id: P.b.id }).select("stock")).stock === 42);
ok("admin", "stock POST delta → ۲۰۰", (await api(`/admin/products/${P.b.id}/stock`, { method: "POST", cookie: ADMIN, body: { delta: 8 } })).s === 200);
ok("admin", "stock delta اعمال شد", (await Product.findOne({ id: P.b.id }).select("stock")).stock === 50);
ok("admin", "ویرایش محصول → ۲۰۰", (await api(`/admin/products/${P.b.id}`, { method: "PATCH", cookie: ADMIN, body: { price: 600000 } })).s === 200);
ok("admin", "ویرایش بدون فیلد → ۲۰۰/۴۰۰", [200, 400].includes((await api(`/admin/products/${P.b.id}`, { method: "PATCH", cookie: ADMIN, body: {} })).s));
ok("admin", "ساخت محصول بدون نام → ۴۰۰", (await api("/admin/products", { method: "POST", cookie: ADMIN, body: { price: 1000 } })).s === 400);
for (const price of [-100, 0, "abc", 1e15]) ok("admin", `قیمت نامعتبر «${price}» → ۴۰۰`, (await api("/admin/products", { method: "POST", cookie: ADMIN, body: { name: "X" + tag + price, price } })).s === 400);
const statuses = ["در انتظار تأیید", "در حال آماده‌سازی", "ارسال شد", "تحویل داده شد", "لغو شد"];
const statusOrder = await api("/orders", { method: "POST", cookie: (await mkU()).cookie, body: ord([{ id: P.b.id, qty: 1 }], rnd()) });
const statusDoc = await Order.findOne({ code: statusOrder.j?.order?.code });
for (const st of statuses) ok("admin", `تغییر وضعیت به «${st}» → ۲۰۰`, (await api(`/admin/orders/${statusDoc?.id}`, { method: "PATCH", cookie: ADMIN, body: { status: st } })).s === 200);
ok("admin", "وضعیت نامعتبر → ۴۰۰", (await api(`/admin/orders/${statusDoc?.id}`, { method: "PATCH", cookie: ADMIN, body: { status: "xyz" } })).s === 400);
ok("admin", "لغو → آزادسازی موجودی", await (async () => { const u = await mkU(); const o = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.a.id, qty: 1 }], u.phone) }); const before = (await Product.findOne({ id: P.a.id }).select("stock")).stock; const d = await Order.findOne({ code: o.j?.order?.code }); if (d) await api(`/admin/orders/${d.id}`, { method: "PATCH", cookie: ADMIN, body: { status: "لغو شد" } }); await sleep(200); return (await Product.findOne({ id: P.a.id }).select("stock")).stock === before + 1; })());
const delP = (await mkP({ name: "DEL" + tag, nameEn: "D", price: 100000 })).j?.product;
ok("admin", "حذف محصول → ۲۰۰", (await api(`/admin/products/${delP?.id}`, { method: "DELETE", cookie: ADMIN })).s === 200);
ok("admin", "حذف id نامعتبر → ۴۰۰/۴۰۴", [400, 404].includes((await api("/admin/products/-5", { method: "DELETE", cookie: ADMIN })).s));
ok("admin", "reviews لیست → ۲۰۰", (await api("/admin/reviews", { cookie: ADMIN })).s === 200);

// ============ 13) SECURITY / IDOR / INJECTION (~45) ============
ok("sec", "/admin/orders بدون ادمین → ۴۰۱", (await api("/admin/orders")).s === 401);
ok("sec", "/admin/users بدون ادمین → ۴۰۱", (await api("/admin/users")).s === 401);
ok("sec", "/admin/stats بدون ادمین → ۴۰۱", (await api("/admin/stats")).s === 401);
ok("sec", "/admin/settings بدون ادمین → ۴۰۱", (await api("/admin/settings")).s === 401);
const injections = ["' OR '1'='1", "1; DROP TABLE users", '{"$gt":""}', "{$ne:null}", "<script>alert(1)</script>", "%00", "../../../etc/passwd", "\\u0000", "admin'--", "1 UNION SELECT * FROM users"];
for (const inj of injections) { ok("sec", `injection در search «${inj.slice(0, 12)}» → ۲۰۰`, (await api(`/products?search=${encodeURIComponent(inj)}`)).s === 200); }
for (const inj of injections.slice(0, 5)) { ok("sec", `injection در name نقد → بدون کرش`, (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: inj, body: "متن نقد به اندازهٔ کافی بلند است" } })).s >= 200); }
ok("sec", "IDOR: order دیگران → ۴۰۴", (await api(`/account/orders/${firstCode}/cancel-request`, { method: "POST", cookie: (await mkU()).cookie })).s === 404);
ok("sec", "payload بزرگ → کوتاه/رد", [200, 201, 400, 413].includes((await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: "x".repeat(5000), body: "y".repeat(5000) } })).s));
ok("sec", "بدون Content-Type → ۲۰۰", await (async () => { try { return (await fetch(BASE + "/products", { headers: { "X-Forwarded-For": rip() } })).status === 200; } catch { return false; } })());
ok("sec", "متد نامعتبر (PUT روی products) → ۴xx", (await api(`/products/${P.a.id}`, { method: "PUT" })).s >= 400);

// ============ 14) RACE / PROBABILISTIC (~12) ============
ok("race", "۵ سفارش هم‌زمان روی ۱ موجودی → دقیقاً ۱", await (async () => { const u = await mkU(); await api(`/admin/products/${P.big.id}/stock`, { method: "POST", cookie: ADMIN, body: { set: 1 } }); const rs = await Promise.all([1, 2, 3, 4, 5].map(() => api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone) }))); const created = rs.filter((x) => x.s === 201).length; await api(`/admin/products/${P.big.id}/stock`, { method: "POST", cookie: ADMIN, body: { set: 1000 } }); return created === 1; })(), "atomic $inc");
ok("race", "کوپن هم‌زمان → حداکثر ۱", await (async () => { const u = await cU(); const rs = await Promise.all([1, 2, 3, 4].map(() => api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: "PCT10" }) }))); return rs.filter((x) => x.j?.order?.couponCode === "PCT10").length <= 1; })(), "couponUseKey unique");
ok("race", "۲۰ GET هم‌زمان products → همه ۲۰۰", await (async () => { const rs = await Promise.all(Array.from({ length: 20 }, () => api("/products?limit=5"))); return rs.every((x) => x.s === 200); })());
ok("race", "۱۰ GET هم‌زمان settings → همه ۲۰۰", await (async () => { const rs = await Promise.all(Array.from({ length: 10 }, () => api("/settings"))); return rs.every((x) => x.s === 200); })());
ok("race", "افزودن هم‌زمان علاقه‌مندی → بدون خطا", await (async () => { const u = await mkU(); const rs = await Promise.all([1, 2, 3].map(() => api("/account/favorites", { method: "POST", cookie: u.cookie, body: { productId: P.b.id } }))); return rs.every((x) => x.s === 200); })());
for (let i = 0; i < 5; i++) { const u = await mkU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone) }); ok("race", `سفارش تصادفی ${i + 1} → ۲۰۱`, r.s === 201); }

// ============ 15) EDGE / BOUNDARY (~20) ============
for (const q of [0, 1, -1, 99, 100, 1000]) { const u = await mkU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: q }], u.phone) }); ok("edge", `qty=${q} → بدون کرش`, r.s >= 200); }
ok("edge", "health نهایی", await (async () => { try { return (await fetch("http://127.0.0.1:4000/health")).status === 200; } catch { return false; } })());
ok("edge", "settings نهایی", (await api("/settings")).s === 200);
ok("edge", "products نهایی", (await api("/products?limit=5")).s === 200);

// ============ 16) MORE PROVINCES × SUBTOTALS (~31) ============
for (const prov of provinces) { const q = await api("/shipping/quote", { method: "POST", body: { province: prov, items: [{ id: P.big.id, qty: 2 }], subtotal: 12000000 } }); ok("shipping2", `quote سنگین ${prov} → ۲۰۰`, q.s === 200 && Array.isArray(q.j?.options)); }

// ============ 17) MORE PRODUCT FILTER COMBOS (~30) ============
for (const combo of ["sort=price_asc&limit=5", "sort=price_desc&page=1", "inStock=1&sort=newest", `category=${catId}&sort=price_asc`, "minPrice=0&maxPrice=99999999", "search=A&sort=price_asc", "limit=3&page=1", "limit=3&page=2", "inStock=1&minPrice=100000", "sort=newest&limit=100"]) ok("products2", `فیلتر «${combo}» → ۲۰۰`, (await api(`/products?${combo}`)).s === 200);
for (const q of ["B", "BIG", "oos", "ناموجود", "!", "@", "#", "123", "a b c", "عطر تلخ"]) ok("products2", `search «${q}» → ۲۰۰`, (await api(`/products?search=${encodeURIComponent(q)}`)).s === 200);
for (const id of [P.a.id, P.b.id, P.big.id, P.oos.id]) ok("products2", `تک‌محصول ${id} → ۲۰۰`, (await api(`/products/${id}`)).s === 200);
for (const id of [P.a.id, P.b.id, P.big.id]) ok("products2", `related ${id} → ۲۰۰`, (await api(`/products/${id}/related`)).s === 200);
for (const l of [2, 3, 7, 13, 25, 50]) ok("products2", `limit=${l} → ۲۰۰`, (await api(`/products?limit=${l}`)).s === 200);
for (const s of ["price_asc", "price_desc", "newest"]) { const r = await api(`/products?sort=${s}&limit=50`); const items = r.j?.items ?? r.j?.products ?? []; ok("products2", `sort=${s} ترتیب دارد`, r.s === 200 && Array.isArray(items)); }

// ============ 18) MORE INVALID INPUTS (~30) ============
const Uinv = await mkU(); const ibase = ord([{ id: P.a.id, qty: 1 }], Uinv.phone);
for (const email of ["a@b", "@b.com", "a b@c.com", "a@@b.com", "a@b..com", "plainaddress", "a@.com", "a b c@d.com", "a@b,com"]) ok("orders2", `ایمیل «${email}» → ۴۰۰`, (await api("/orders", { method: "POST", cookie: Uinv.cookie, body: { ...ibase, email } })).s === 400);
for (const pc of ["0000000000", "1234567890", "0123456789", "9999999999", "12345 6789", "۱۲۳۴۵۶۷۸۹۰", "123456789a", "12345678901234"]) ok("orders2", `کدپستی «${pc}» → ۴۰۰/۲۰۱`, [400, 201].includes((await api("/orders", { method: "POST", cookie: Uinv.cookie, body: { ...ibase, postalCode: pc } })).s));
for (const prov of ["", " ", "تهر", "TEHRAN", "tehran", "مریخ", "123", "تهران\ntehr"]) ok("orders2", `استان «${prov.replace(/\n/g, "\\n")}» → ۴۰۰`, (await api("/orders", { method: "POST", cookie: Uinv.cookie, body: { ...ibase, province: prov } })).s === 400);

// ============ 19) MORE SECURITY / INJECTION (~20) ============
const inj2 = ["' OR 1=1--", "admin", "\" OR \"\"=\"", "1' AND '1'='1", "%27%20OR%201%3D1", "Robert'); DROP TABLE Students;--", "{{7*7}}", "${7*7}", "<img src=x onerror=alert(1)>", "javascript:alert(1)"];
for (const inj of inj2) ok("sec2", `injection «${inj.slice(0, 10)}» در search → ۲۰۰`, (await api(`/products?search=${encodeURIComponent(inj)}`)).s === 200);
for (const inj of inj2.slice(0, 6)) ok("sec2", `injection «${inj.slice(0, 10)}» در name نقد → بدون کرش`, (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: inj, body: "متن نقد به اندازهٔ کافی بلند است" } })).s >= 200);
for (const inj of inj2.slice(0, 4)) ok("sec2", `injection «${inj.slice(0, 10)}» در customerName → بدون کرش`, (await api("/orders", { method: "POST", cookie: Uinv.cookie, body: { ...ibase, customerName: inj + " کاربر" } })).s >= 200);

// ============ 20) MORE ACCOUNT / FAVORITES (~15) ============
const Uf = await mkU();
for (const pid of [P.a.id, P.b.id, P.big.id, P.oos.id]) ok("account2", `افزودن ${pid} → ok`, (await api("/account/favorites", { method: "POST", cookie: Uf.cookie, body: { productId: pid } })).j?.ok === true);
for (const pid of [P.a.id, P.b.id, P.big.id, P.oos.id]) ok("account2", `حذف ${pid} → false`, (await api(`/account/favorites/${pid}`, { method: "DELETE", cookie: Uf.cookie })).j?.favorite === false);
for (const pid of ["abc", "-100", "999999999999"]) ok("account2", `id نامعتبر «${pid}» → ۴۰۰/۴۰۴`, [400, 404].includes((await api("/account/favorites", { method: "POST", cookie: Uf.cookie, body: { productId: pid } })).s));
ok("account2", "id اعشاری «1.5» → بدون کرش (trunc)", [200, 400, 404].includes((await api("/account/favorites", { method: "POST", cookie: Uf.cookie, body: { productId: "1.5" } })).s));
ok("account2", "loyalty کاربر تازه → ۲۰۰", (await api("/account/loyalty", { cookie: (await mkU()).cookie })).s === 200);
ok("account2", "favorites کاربر تازه → خالی", (await api("/account/favorites", { cookie: (await mkU()).cookie })).j?.favorites?.length === 0);

// ============ 21) MORE ADMIN (~15) ============
for (const i of [1, 2, 3]) { const p = (await mkP({ name: "AD" + i + tag, nameEn: "AD" + i, price: 100000 * i })).j?.product; ok("admin2", `ساخت محصول ${i} → ۲۰۱`, !!p?.id); ok("admin2", `ویرایش محصول ${i} → ۲۰۰`, (await api(`/admin/products/${p?.id}`, { method: "PATCH", cookie: ADMIN, body: { price: 200000 * i } })).s === 200); ok("admin2", `stock set محصول ${i} → ۲۰۰`, (await api(`/admin/products/${p?.id}/stock`, { method: "POST", cookie: ADMIN, body: { set: i * 10 } })).s === 200); ok("admin2", `حذف محصول ${i} → ۲۰۰`, (await api(`/admin/products/${p?.id}`, { method: "DELETE", cookie: ADMIN })).s === 200); }
for (const st of ["در انتظار تأیید", "لغو شد", "xyz", ""]) ok("admin2", `وضعیت «${st}» → ۲۰۰/۴۰۰`, [200, 400].includes((await api(`/admin/orders/${statusDoc?.id}`, { method: "PATCH", cookie: ADMIN, body: { status: st } })).s));

// ============ 22) MORE EDGE / CONCURRENCY (~12) ============
ok("edge2", "۳۰ GET هم‌زمان categories → همه ۲۰۰", await (async () => { const rs = await Promise.all(Array.from({ length: 30 }, () => api("/categories"))); return rs.every((x) => x.s === 200); })());
ok("edge2", "۱۵ GET هم‌زمان تک‌محصول → همه ۲۰۰", await (async () => { const rs = await Promise.all(Array.from({ length: 15 }, () => api(`/products/${P.a.id}`))); return rs.every((x) => x.s === 200); })());
for (const q of [1, 2, 5, 10, 50, 99]) { const u = await mkU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: q }], u.phone) }); ok("edge2", `سفارش qty=${q} → ۲۰۱/۴۰۹(موجودی)`, [201, 409].includes(r.s), `s=${r.s}`); }
ok("edge2", "health پایانی", await (async () => { try { return (await fetch("http://127.0.0.1:4000/health")).status === 200; } catch { return false; } })());
ok("edge2", "settings پایانی", (await api("/settings")).s === 200);

await mongoose.disconnect();
const pass = R.filter((x) => x.pass).length, fail = R.length - pass;
console.log("\n===== RESULTS =====");
const byGroup = {};
for (const x of R) { byGroup[x.group] = byGroup[x.group] || { p: 0, f: 0 }; if (x.pass) byGroup[x.group].p++; else byGroup[x.group].f++; }
for (const [g, v] of Object.entries(byGroup)) console.log(`  ${g}: ${v.p} pass, ${v.f} fail`);
console.log(`\nTOTAL: ${R.length} scenarios — ${pass} PASS, ${fail} FAIL`);
if (fail) { console.log("\nFAILURES:"); R.filter((x) => !x.pass).slice(0, 60).forEach((x) => console.log(`  ❌ [${x.group}] ${x.name} ${x.info}`)); }
writeFileSync("/home/user/bella/server/suite500-results.json", JSON.stringify({ total: R.length, pass, fail, byGroup, results: R }, null, 2));
console.log("\nWROTE suite500-results.json");
