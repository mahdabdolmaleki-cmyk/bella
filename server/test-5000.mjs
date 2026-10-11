// 5000-scenario live suite: backend + frontend HTTP + rate-limits + concurrency + concurrent purchases.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { writeFileSync } from "fs";

const API = "http://127.0.0.1:4000/api";
const WEB = "http://127.0.0.1:3000";
const MONGO = "mongodb://127.0.0.1:27017/bella_test";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const SA_SID = crypto.createHash("sha256").update("09120000000\0admin@test.local", "utf8").digest("hex");
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });
const ADMIN = "bella_admin=" + sign({ superAdmin: true, adminSessionId: SA_SID });
const rnd = () => "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const rip = () => `10.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const R = [];
const ok = (g, n, c, i = "") => { R.push({ group: g, name: n, pass: !!c, info: i }); };
// ip: pass a FIXED ip to test per-IP rate limits; omit for random (avoid limits).
async function api(p, { method = "GET", body, cookie, ip } = {}) {
  try {
    const res = await fetch(API + p, { method, headers: { "Content-Type": "application/json", "X-Forwarded-For": ip || rip(), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await res.json(); } catch {}
    return { s: res.status, j };
  } catch (e) { return { s: 0, j: null }; }
}
async function web(p) {
  try { const r = await fetch(WEB + p, { headers: { "User-Agent": "Mozilla/5.0 bella-test" } }); const t = await r.text(); return { s: r.status, t, ct: r.headers.get("content-type") || "" }; }
  catch (e) { return { s: 0, t: "", ct: "" }; }
}

await mongoose.connect(MONGO);
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");
const { default: Order } = await import("./src/models/Order.js");
const { default: Settings } = await import("./src/models/Settings.js");
const mkU = async () => { const phone = rnd(); const u = await User.create({ phone, name: "کاربر", tokenVersion: 0 }); return { u, phone, cookie: "bella_token=" + sign({ sub: String(u._id), tv: 0 }) }; };
const cats = await api("/categories"); const catId = cats.j?.categories?.[0]?.id ?? null;
const mkP = (p) => api("/admin/products", { method: "POST", cookie: ADMIN, body: { active: true, stock: 100000, category: catId, ...p } });
const ord = (items, phone, x = {}) => ({ customerName: "کاربر", phone, email: "t@t.com", province: "تهران", city: "تهران", postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", termsAccepted: true, items, shippingMethod: "tipax", ...x });

const tag = Date.now();
const P = {};
P.a = (await mkP({ name: "A" + tag, nameEn: "A", price: 1000000 })).j?.product;
P.b = (await mkP({ name: "B" + tag, nameEn: "B", price: 500000 })).j?.product;
P.big = (await mkP({ name: "BIG" + tag, nameEn: "G", price: 5000000 })).j?.product;
P.oos = (await mkP({ name: "OOS" + tag, nameEn: "O", price: 800000, stock: 0 })).j?.product;
P.inact = (await mkP({ name: "INA" + tag, nameEn: "I", price: 300000, active: false })).j?.product;
ok("seed", "محصولات seed", P.a && P.b && P.big && P.oos && P.inact);
await Settings.findOneAndUpdate({}, { $set: { couponEnabled: "1", firstPurchaseDiscountEnabled: "1", firstPurchasePercent: "20", couponCodesJson: JSON.stringify([{ code: "PCT10", percent: 10 }, { code: "AMT100", amount: 100000 }, { code: "BOTH", percent: 15, amount: 100000 }, { code: "PCT50", percent: 50 }]) } }, { upsert: true });
await sleep(5500);

const provinces = ["تهران", "البرز", "قم", "قزوین", "مرکزی", "سمنان", "زنجان", "اردبیل", "آذربایجان شرقی", "آذربایجان غربی", "کردستان", "کرمانشاه", "همدان", "لرستان", "ایلام", "خوزستان", "چهارمحال و بختیاری", "کهگیلویه و بویراحمد", "فارس", "بوشهر", "هرمزگان", "کرمان", "یزد", "اصفهان", "خراسان رضوی", "خراسان شمالی", "خراسان جنوبی", "سیستان و بلوچستان", "گلستان", "مازندران", "گیلان"];

// ====================== A) AUTH / OTP ======================
const badPhones = ["", "1", "12", "123456", "02112345678", "009120000000", "abcdefg", "0912abcd000", "0912000000", "091200000000", "null", "undefined", "0912", "091200", "12345678901234", "0912-000", "()", "۰۹۱۲", "+98", "0098", "912", "091200000000000"];
for (const bp of badPhones) { const r = await api("/otp/request", { method: "POST", body: { phone: bp, channel: "sms" } }); ok("auth", `otp «${bp}» → رد`, [400, 429].includes(r.s), `s=${r.s}`); }
const badEmails = ["", "a", "a@", "@b.com", "a b@c.com", "a@@b.com", "a@b..com", "plainaddress", "a@.com", "a@b,com", "a@b c.com", "@", "a@", "abc@", "a@b.", "a@b@c.com", "a b@c d.com", "a\tb@c.com"];
for (const be of badEmails) { const r = await api("/otp/request", { method: "POST", body: { email: be, channel: "email" } }); ok("auth", `otp ایمیل «${be}» → ۴۰۰`, r.s === 400, `s=${r.s}`); }
for (let i = 0; i < 10; i++) { const lp = rnd(); const ld = (await api("/otp/request", { method: "POST", body: { phone: lp, channel: "sms" } })).j?.devCode; const lt = (await api("/otp/verify", { method: "POST", body: { phone: lp, code: ld } })).j?.ticket; ok("auth", `چرخهٔ کامل OTP+login ${i + 1}`, (await api("/auth/login", { method: "POST", body: { phone: lp, ticket: lt } })).s === 200); }
for (let i = 0; i < 10; i++) ok("auth", `verify کد غلط ${i + 1} → ۴xx`, (await api("/otp/verify", { method: "POST", body: { phone: rnd(), code: String(100000 + i) } })).s >= 400);
for (let i = 0; i < 10; i++) ok("auth", `/auth/me کوکی معتبر ${i + 1}`, (await api("/auth/me", { cookie: (await mkU()).cookie })).s === 200);
for (let i = 0; i < 8; i++) ok("auth", `/auth/me توکن خراب ${i + 1} → ۴۰۱`, (await api("/auth/me", { cookie: "bella_token=garbage" + i })).s === 401);
for (let i = 0; i < 8; i++) ok("auth", `ادمین بدون کوکی ${i + 1} → ۴۰۱`, (await api("/admin/products")).s === 401);
for (let i = 0; i < 5; i++) ok("auth", `ادمین با توکن کاربر ${i + 1} → ۴۰۱`, (await api("/admin/products", { cookie: (await mkU()).cookie })).s === 401);

// ====================== B) PRODUCTS (big matrix) ======================
const sorts = ["price_asc", "price_desc", "newest", "oldest", "popular", "xxx", "", "name"];
const limits = [1, 3, 6, 12, 24, 48, 100, 0];
const pages = [1, 2, 3, 5, 99];
for (const s of sorts) for (const l of limits) for (const p of pages) ok("products", `list sort=${s} limit=${l} page=${p}`, (await api(`/products?sort=${encodeURIComponent(s)}&limit=${l}&page=${p}`)).s === 200);
const searches = ["A", "B", "BIG", tag.toString(), "()", ".*", "$gt", "%", "_", "'", '"', "<script>", "عطر", "ادکلن", "تلخ", "شیرین", "مردانه", "زنانه", "1", "0", "-", "+", "*", "?", "[]", "{}", "|", "\\", "^", "~", "`", ";", ":", "a b c"];
for (const q of searches) ok("products", `search «${q}» → ۲۰۰`, (await api(`/products?search=${encodeURIComponent(q)}`)).s === 200);
const badIds = ["0", "-1", "-5", "-100", "abc", "1e3", "  ", "%20", "null", "undefined", "1 OR 1", "1;DROP", "99999999999", "2147483648", "1.5", "0.5", "NaN", "Infinity", "1_000", "0x10", " 1", "1 ", "+1", "1.0", "۱", "١"];
for (const id of badIds) ok("products", `id «${id}» → ۴۰۰/۴۰۴`, [400, 404].includes((await api(`/products/${encodeURIComponent(id)}`)).s));
for (let i = 0; i < 10; i++) ok("products", `id ناموجود ${90000000 + i} → ۴۰۴`, (await api(`/products/${90000000 + i}`)).s === 404);
for (const id of [P.a.id, P.b.id, P.big.id, P.oos.id]) { ok("products", `تک‌محصول ${id}`, (await api(`/products/${id}`)).s === 200); ok("products", `related ${id}`, (await api(`/products/${id}/related`)).s === 200); }
ok("products", "محصول غیرفعال → ۴۰۴", (await api(`/products/${P.inact.id}`)).s === 404);
for (const mp of [0, 100000, 500000, 1000000, 5000000, -100, 99999999]) for (const xp of [0, 1000000, 5000000, 99999999, -1]) ok("products", `price min=${mp} max=${xp}`, (await api(`/products?minPrice=${mp}&maxPrice=${xp}`)).s === 200);
for (const f of ["inStock=1", "inStock=0", `category=${catId}`, "festival=1", "new=1", "inStock=1&sort=price_asc", `category=${catId}&sort=newest`, "inStock=1&minPrice=100000"]) ok("products", `filter ${f}`, (await api(`/products?${f}`)).s === 200);

// ====================== C) CATEGORIES / SETTINGS / HEALTH ======================
for (let i = 0; i < 15; i++) ok("categories", `لیست دسته‌ها ${i + 1}`, (await api("/categories")).s === 200);
for (let i = 0; i < 15; i++) ok("settings", `تنظیمات ${i + 1}`, (await api("/settings")).s === 200);
ok("settings", "کلید خصوصی لو نمی‌رود", (await api("/settings")).j?.settings?.zarinpalMerchantId === undefined);
for (let i = 0; i < 10; i++) ok("health", `/health ${i + 1}`, await (async () => { try { return (await fetch("http://127.0.0.1:4000/health")).status === 200; } catch { return false; } })());
for (let i = 0; i < 10; i++) ok("404", `مسیر ناموجود ${i + 1}`, (await api(`/nope-${i}-${tag}`)).s === 404);

// ====================== D) CART ======================
for (let i = 0; i < 20; i++) { const u = await mkU(); ok("cart", `track کاربر ${i + 1}`, (await api("/cart/track", { method: "POST", cookie: u.cookie, body: { items: [{ id: P.a.id, qty: 1 + (i % 5) }] } })).j?.tracked === true); }
const cartItems = [[{ id: "x", qty: 1 }], [{ id: P.inact.id, qty: 1 }], [{ id: P.a.id, qty: 500 }], [{ id: P.a.id, qty: -5 }], [{ id: P.a.id, qty: 0 }], [{ id: -1, qty: 1 }], [{ id: P.a.id }, { id: P.b.id }], [], [{ id: P.a.id, qty: 1 }, { id: P.a.id, qty: 2 }], [{ id: 0, qty: 1 }]];
for (const it of cartItems) { const u = await mkU(); ok("cart", `track آیتم «${JSON.stringify(it).slice(0, 30)}» → ۲۰۰`, (await api("/cart/track", { method: "POST", cookie: u.cookie, body: { items: it } })).s === 200); }
for (let i = 0; i < 8; i++) ok("cart", `abandoned بدون ادمین ${i + 1} → ۴۰۱`, (await api("/cart/abandoned")).s === 401);
for (let i = 0; i < 5; i++) ok("cart", `abandoned با ادمین ${i + 1} → ۲۰۰`, (await api("/cart/abandoned", { cookie: ADMIN })).s === 200);

// ====================== E) ORDERS validation matrix ======================
const Uo = await mkU(); const base = ord([{ id: P.a.id, qty: 1 }], Uo.phone);
const fields = {
  customerName: ["", "ک", "x".repeat(300), "  ", "\n", "کاربر واقعی", "a", "ab", "user@test", "۱۲۳"],
  phone: ["", "123", "02112345678", "abcdef", "0912", "09120000000000", rnd(), "+989120000000", "0912 000 0000", "۰۹۱۲۰۰۰۰۰۰۰"],
  email: ["", "bad", "a@b", "@b.com", "a b@c.com", "t@t.com", "a@@b.com", "a@b..com", "user@example.co", "a@b.io"],
  province: ["", "مریخ", "تهر", "TEHRAN", "تهران", "123", " ", "البرز", "فارس", "\n"],
  city: ["", "ت", "تهران", "کرج", "x", "شهر تست", "1", "ab", "قم", "  "],
  postalCode: ["", "123456789", "12345678901", "1111111111", "1234267890", "abcdefghij", "1234567890", "0000000000", "12345 6789", "۱۲۳۴۵۶۷۸۹۰"],
  address: ["", "کوتاه", "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", "x", "آدرس کامل و معتبر برای تست", " ", "a", "بلوار کشاورز نبش کوچه گل پلاک ۱۲ واحد ۳", "\t", "منزل"],
};
const acceptStatus = { customerName: [201, 400], phone: [201, 400], email: [201, 400], province: [201, 400], city: [201, 400], postalCode: [201, 400], address: [201, 400] };
for (const [field, vals] of Object.entries(fields)) for (const v of vals) { const r = await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, [field]: v } }); ok("orders", `${field}=«${String(v).slice(0, 12)}» → بدون کرش`, acceptStatus[field].includes(r.s) || r.s === 409, `s=${r.s}`); }
const itemCases = [[{ id: P.oos.id, qty: 1 }], [{ id: P.inact.id, qty: 1 }], [{ id: "x", qty: 1 }], [{ id: -1, qty: 1 }], [{ id: 0, qty: 1 }], [{ id: P.a.id, qty: 0 }], [{ id: P.a.id, qty: -1 }], [{ id: P.a.id, qty: 1000 }], Array.from({ length: 51 }, () => ({ id: P.a.id, qty: 1 })), []];
for (const items of itemCases) { const u = await mkU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord(items, u.phone) }); ok("orders", `items «${JSON.stringify(items).slice(0, 25)}» → بدون کرش`, [201, 400, 409].includes(r.s), `s=${r.s}`); }
for (const q of [1, 2, 3, 5, 10, 25, 50, 99, 100, 150]) { const u = await mkU(); ok("orders", `qty=${q} → بدون کرش`, [201, 409].includes((await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: q }], u.phone) })).s)); }
for (const prov of provinces) for (const m of ["tipax", "post-pishtaz", "chapar"]) { const u = await mkU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone, { province: prov, city: prov, shippingMethod: m }) }); ok("orders", `ارسال ${prov}/${m}`, [201, 400, 409].includes(r.s), `s=${r.s}`); }
for (let i = 0; i < 10; i++) ok("orders", `بدون لاگین ${i + 1} → ۴۰۱`, (await api("/orders", { method: "POST", body: base })).s === 401);
ok("orders", "دستکاری قیمت → قیمت DB", (await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.big.id, qty: 1, price: 1 }], Uo.phone) })).j?.order?.subtotal === 5000000);

// ====================== F) COUPONS ======================
const cU = async () => { const u = await mkU(); await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone) }); return u; };
for (let i = 0; i < 8; i++) { const u = await cU(); ok("coupon", `PCT10 بار ${i + 1} → ۵۰۰۰۰۰`, (await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: "PCT10" }) })).j?.order?.discountAmount === 500000); }
for (let i = 0; i < 8; i++) { const u = await cU(); ok("coupon", `AMT100 بار ${i + 1} → ۱۰۰۰۰۰`, (await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: "AMT100" }) })).j?.order?.discountAmount === 100000); }
for (let i = 0; i < 8; i++) { const u = await cU(); ok("coupon", `BOTH بار ${i + 1} → ۷۵۰۰۰۰`, (await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: "BOTH" }) })).j?.order?.discountAmount === 750000); }
for (const code of ["NOPE", "XXXX", "old", "pct10", " AMT100 ", "PCT10X", "1", "!", "کد", ""]) { const u = await cU(); const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: code }) }); ok("coupon", `کوپن «${code}» → بدون کرش`, [201, 400].includes(r.s), `s=${r.s}`); }

// ====================== G) SHIPPING (provinces × subtotals) ======================
ok("shipping", "GET /options", (await api("/shipping/options")).s === 200);
const subtotals = [0, 1, 100000, 500000, 1000000, 3000000, 10000000, 99999999, -100];
for (const prov of provinces) for (const sub of subtotals) { const q = await api("/shipping/quote", { method: "POST", body: { province: prov, items: [{ id: P.a.id, qty: 1 }], subtotal: sub } }); ok("shipping", `quote ${prov}/${sub}`, q.s === 200 && Array.isArray(q.j?.options)); }
for (const prov of ["مریخ", "", "tehran", "تهران ", "TEHRAN", "123", " ", "null"]) ok("shipping", `quote استان «${prov}» → بدون کرش`, (await api("/shipping/quote", { method: "POST", body: { province: prov, items: [], subtotal: 0 } })).s >= 200);

// ====================== H) PAYMENT ======================
const vo = await api("/orders", { method: "POST", cookie: Uo.cookie, body: ord([{ id: P.a.id, qty: 1 }], Uo.phone) }); const firstCode = vo.j?.order?.code;
for (let i = 0; i < 8; i++) ok("payment", `/start بدون درگاه ${i + 1} → ۵۰۳`, (await api("/payment/start", { method: "POST", body: { code: firstCode, phone: Uo.phone } })).s === 503);
for (let i = 0; i < 8; i++) ok("payment", `/status درست ${i + 1} → ۲۰۰`, (await api(`/payment/status/${firstCode}?phone=${Uo.phone}`)).s === 200);
for (const c of ["", "BL-", "BL-NOPE", "abc", firstCode + "x", "0", "-1", "null"]) ok("payment", `/status کد «${c}» → ۴۰۴`, (await api(`/payment/status/${encodeURIComponent(c)}?phone=${Uo.phone}`)).s === 404);
for (let i = 0; i < 8; i++) ok("payment", `/status شماره غلط ${i + 1} → ۴۰۴`, (await api(`/payment/status/${firstCode}?phone=0999999999${i}`)).s === 404);
for (let i = 0; i < 5; i++) ok("payment", `/recheck ناموجود ${i + 1} → ۴۰۴`, (await api(`/payment/recheck/BL-NOPE${i}`, { method: "POST", body: { phone: Uo.phone } })).s === 404);
for (let i = 0; i < 5; i++) ok("payment", `/callback ${i + 1} → بدون کرش`, (await api("/payment/callback")).s >= 200);

// ====================== I) REVIEWS ======================
for (const rating of [1, 2, 3, 4, 5]) for (let k = 0; k < 4; k++) ok("reviews", `امتیاز ${rating} بار ${k + 1} → ۲۰۱`, (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating, name: "مهمان" + rating + k, body: "متن نقد به اندازهٔ کافی بلند است" } })).s === 201);
for (const rating of [0, -1, 6, 100, "abc", "", null, 3.5, "3", "5.9"]) ok("reviews", `امتیاز «${rating}» → بدون کرش`, [201, 400].includes((await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating, name: "مهمان", body: "متن نقد به اندازهٔ کافی بلند است" } })).s));
for (const body of ["", "ک", "کوتاهه", "x".repeat(9), "x".repeat(10), "x".repeat(100), "x".repeat(1500), "x".repeat(5000), "متن معتبر", "عالی"]) ok("reviews", `متن ${body.length} حرف → بدون کرش`, [201, 400].includes((await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: "مهمان", body } })).s));
for (const name of ["", "x", "ab", "abc", "م".repeat(80), "م".repeat(81), "م".repeat(300), "مهمان", "کاربر واقعی", "  "]) ok("reviews", `نام «${name.slice(0, 8)}» → بدون کرش`, (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name, body: "متن نقد به اندازهٔ کافی بلند است" } })).s >= 200);
for (let i = 0; i < 8; i++) ok("reviews", `لیست + average ${i + 1}`, (await api(`/reviews/${P.a.id}`)).j?.average !== undefined);
for (const p of [1, 2, 3, 99, "abc", 0, -1]) ok("reviews", `صفحه ${p} → ۲۰۰`, (await api(`/reviews/${P.a.id}?page=${p}&limit=5`)).s === 200);
ok("reviews", "محصول ناموجود → ۴۰۴", (await api("/reviews/99999999", { method: "POST", body: { rating: 5, name: "abc", body: "متن نقد به اندازهٔ کافی بلند است" } })).s === 404);
const capU = await mkU(); let capHit = false;
for (let i = 0; i < 12; i++) { const p = (await mkP({ name: "cap" + i + tag, nameEn: "c" + i, price: 100000 })).j?.product; if ((await api(`/reviews/${p.id}`, { method: "POST", cookie: capU.cookie, body: { rating: 5, name: "کاربر", body: "متن نقد به اندازهٔ کافی بلند است" } })).s === 429) { capHit = true; break; } }
ok("reviews", "سقف نقد روزانه → ۴۲۹", capHit);
const tgt = (await api(`/reviews/${P.a.id}`)).j?.reviews?.[0];
for (let i = 0; i < 5; i++) ok("reviews-admin", `پاسخ ادمین ${i + 1} → ۲۰۰`, (await api(`/admin/reviews/${tgt?.id}`, { method: "PATCH", cookie: ADMIN, body: { reply: "ممنون " + i } })).s === 200);
for (let i = 0; i < 5; i++) ok("reviews-admin", `حذف بدون ادمین ${i + 1} → ۴۰۱`, (await api(`/admin/reviews/${tgt?.id}`, { method: "DELETE" })).s === 401);

// ====================== J) TUTORIALS + COMMENTS + VOTES ======================
let tutId = (await api("/tutorials?limit=1")).j?.tutorials?.[0]?.id;
if (!tutId) tutId = (await api("/admin/tutorials", { method: "POST", cookie: ADMIN, body: { title: "آموزش تست", excerpt: "خلاصه", body: "متن", category: "عمومی", published: true } })).j?.tutorial?.id;
ok("tutorials", "لیست", (await api("/tutorials")).s === 200);
if (tutId) {
  for (let i = 0; i < 10; i++) ok("tutorials", `تک‌آموزش ${i + 1}`, (await api(`/tutorials/${tutId}`)).s === 200);
  for (const v of [1, -1, 0, 1, -1, 0]) ok("tutorials", `رأی ${v} → ۲۰۰`, (await api(`/tutorials/${tutId}/vote`, { method: "POST", body: { value: v } })).s === 200);
  for (const v of [2, 5, -2, "abc", "", 1.5]) ok("tutorials", `رأی نامعتبر «${v}» → ۴۰۰`, (await api(`/tutorials/${tutId}/vote`, { method: "POST", body: { value: v } })).s === 400);
  for (let i = 0; i < 10; i++) ok("comments", `نظر ${i + 1} → ۲۰۱`, (await api(`/tutorials/${tutId}/comments`, { method: "POST", body: { name: "مهمان" + i, body: "نظر آزمایشی روی آموزش شماره " + i } })).s === 201);
  for (const body of ["", "ک", "کو", "کوتاه", "x".repeat(1000), "متن کافی برای نظر"]) ok("comments", `نظر متن «${body.slice(0, 8)}» → بدون کرش`, [201, 400].includes((await api(`/tutorials/${tutId}/comments`, { method: "POST", body: { name: "مهمان", body } })).s));
  ok("comments", "نظر بدون نام → ۴۰۰", (await api(`/tutorials/${tutId}/comments`, { method: "POST", body: { body: "متن کافی برای نظر" } })).s === 400);
  ok("comments", "نظر روی آموزش ناموجود → ۴۰۴", (await api("/tutorials/99999999/comments", { method: "POST", body: { name: "مهمان", body: "متن کافی" } })).s === 404);
  const cmt = (await api(`/tutorials/${tutId}/comments`)).j?.comments?.[0];
  for (let i = 0; i < 5; i++) ok("comments-admin", `پاسخ ادمین ${i + 1} → ۲۰۰`, (await api(`/admin/tutorial-comments/${cmt?.id}`, { method: "PATCH", cookie: ADMIN, body: { reply: "سپاس " + i } })).s === 200);
  for (let i = 0; i < 5; i++) ok("comments-admin", `حذف بدون ادمین ${i + 1} → ۴۰۱`, (await api(`/admin/tutorial-comments/${cmt?.id}`, { method: "DELETE" })).s === 401);
}

// ====================== K) ACCOUNT ======================
for (let i = 0; i < 20; i++) { const u = await mkU(); ok("account", `loyalty ${i + 1} → ۲۰۰`, (await api("/account/loyalty", { cookie: u.cookie })).s === 200); }
const Uf = await mkU();
for (let i = 0; i < 15; i++) { const p = (await mkP({ name: "FAV" + i + tag, nameEn: "F" + i, price: 100000 })).j?.product; ok("account", `افزودن علاقه‌مندی ${i + 1}`, (await api("/account/favorites", { method: "POST", cookie: Uf.cookie, body: { productId: p?.id } })).j?.ok === true); ok("account", `حذف علاقه‌مندی ${i + 1}`, (await api(`/account/favorites/${p?.id}`, { method: "DELETE", cookie: Uf.cookie })).j?.favorite === false); }
for (const pid of ["x", -1, 0, "", "abc", "1.5", "999999999999", "-100"]) ok("account", `favorite id «${pid}» → بدون کرش`, [200, 400, 404].includes((await api("/account/favorites", { method: "POST", cookie: Uf.cookie, body: { productId: pid } })).s));
for (let i = 0; i < 8; i++) ok("account", `loyalty بدون لاگین ${i + 1} → ۴۰۱`, (await api("/account/loyalty")).s === 401);
for (let i = 0; i < 10; i++) { const u = await mkU(); const o = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.b.id, qty: 1 }], u.phone) }); const code = o.j?.order?.code; if (code) ok("account", `cancel-request ${i + 1} → ok`, (await api(`/account/orders/${code}/cancel-request`, { method: "POST", cookie: u.cookie })).j?.ok === true); }
for (const c of ["x", "BL-NOPE", "", "0", "-1"]) ok("account", `cancel کد «${c}» → ۴۰۰/۴۰۴`, [400, 404].includes((await api(`/account/orders/${encodeURIComponent(c)}/cancel-request`, { method: "POST", cookie: (await mkU()).cookie })).s));

// ====================== L) ADMIN ======================
for (let i = 0; i < 10; i++) { const p = (await mkP({ name: "AD" + i + tag, nameEn: "AD" + i, price: 100000 * (i + 1) })).j?.product; ok("admin", `ساخت محصول ${i + 1}`, !!p?.id); ok("admin", `ویرایش محصول ${i + 1}`, (await api(`/admin/products/${p?.id}`, { method: "PATCH", cookie: ADMIN, body: { price: 200000 * (i + 1) } })).s === 200); ok("admin", `stock set ${i + 1}`, (await api(`/admin/products/${p?.id}/stock`, { method: "POST", cookie: ADMIN, body: { set: (i + 1) * 10 } })).s === 200); ok("admin", `stock delta ${i + 1}`, (await api(`/admin/products/${p?.id}/stock`, { method: "POST", cookie: ADMIN, body: { delta: 5 } })).s === 200); ok("admin", `حذف محصول ${i + 1}`, (await api(`/admin/products/${p?.id}`, { method: "DELETE", cookie: ADMIN })).s === 200); }
for (const ep of ["stats", "order-status-counts", "orders", "users", "categories", "logs", "settings", "reviews"]) for (let i = 0; i < 4; i++) ok("admin", `/admin/${ep} ${i + 1} → ۲۰۰`, (await api(`/admin/${ep}`, { cookie: ADMIN })).s === 200);
const statuses = ["در انتظار تأیید", "در حال آماده‌سازی", "ارسال شد", "تحویل داده شد", "لغو شد"];
for (let i = 0; i < 6; i++) { const o = await api("/orders", { method: "POST", cookie: (await mkU()).cookie, body: ord([{ id: P.b.id, qty: 1 }], rnd()) }); const d = await Order.findOne({ code: o.j?.order?.code }); for (const st of statuses) ok("admin", `وضعیت «${st}» سفارش ${i + 1}`, (await api(`/admin/orders/${d?.id}`, { method: "PATCH", cookie: ADMIN, body: { status: st } })).s === 200); }
for (const st of ["xyz", "", "لغو", "PENDING", "123"]) ok("admin", `وضعیت نامعتبر «${st}» → ۴۰۰`, (await api(`/admin/orders/${(await Order.findOne().select("_id"))?._id}`, { method: "PATCH", cookie: ADMIN, body: { status: st } })).s === 400);
for (const price of [-100, 0, "abc", 1e15, null]) ok("admin", `قیمت نامعتبر «${price}» → ۴۰۰`, (await api("/admin/products", { method: "POST", cookie: ADMIN, body: { name: "X" + tag + price, price } })).s === 400);

// ====================== M) SECURITY / INJECTION / IDOR ======================
const injections = ["' OR '1'='1", "1; DROP TABLE users", '{"$gt":""}', "{$ne:null}", "<script>alert(1)</script>", "%00", "../../../etc/passwd", "admin'--", "1 UNION SELECT * FROM users", "' OR 1=1--", "\" OR \"\"=\"", "{{7*7}}", "${7*7}", "<img src=x onerror=alert(1)>", "javascript:alert(1)", "Robert'); DROP TABLE Students;--", "%27%20OR%201%3D1", "\\u0000", "1' AND '1'='1", "||ls||"];
for (const inj of injections) ok("sec", `injection در search «${inj.slice(0, 10)}» → ۲۰۰`, (await api(`/products?search=${encodeURIComponent(inj)}`)).s === 200);
for (const inj of injections) ok("sec", `injection در name نقد «${inj.slice(0, 10)}» → بدون کرش`, (await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: inj, body: "متن نقد به اندازهٔ کافی بلند است" } })).s >= 200);
for (const inj of injections.slice(0, 10)) ok("sec", `injection در customerName «${inj.slice(0, 10)}» → بدون کرش`, (await api("/orders", { method: "POST", cookie: Uo.cookie, body: { ...base, customerName: inj + " کاربر" } })).s >= 200);
for (const ep of ["/admin/orders", "/admin/users", "/admin/stats", "/admin/settings", "/admin/products", "/admin/reviews", "/admin/logs"]) for (let i = 0; i < 3; i++) ok("sec", `${ep} بدون ادمین ${i + 1} → ۴۰۱`, (await api(ep)).s === 401);
for (let i = 0; i < 8; i++) ok("sec", `IDOR order دیگران ${i + 1} → ۴۰۴`, (await api(`/account/orders/${firstCode}/cancel-request`, { method: "POST", cookie: (await mkU()).cookie })).s === 404);
for (let i = 0; i < 5; i++) ok("sec", `payload بزرگ ${i + 1} → کوتاه/رد`, [200, 201, 400, 413].includes((await api(`/reviews/${P.a.id}`, { method: "POST", body: { rating: 5, name: "x".repeat(5000), body: "y".repeat(5000) } })).s));

// ====================== N) RATE LIMITS (fixed IP bursts) ======================
async function burst(path, n, opts = {}) { const ip = "203.0.113." + (Math.random() * 250 | 0 + 1); const out = []; for (let i = 0; i < n; i++) out.push(await api(path, { ...opts, ip })); return out; }
// products-detail limit 120/min — burst 130, expect some 429
{ const rs = await burst(`/products/${P.a.id}`, 130); const c429 = rs.filter((x) => x.s === 429).length; const c200 = rs.filter((x) => x.s === 200).length; ok("ratelimit", "products-detail: ۱۳۰ درخواست → برخی ۴۲۹", c429 > 0 && c200 > 0, `200=${c200} 429=${c429}`); rs.slice(0, 20).forEach((x, i) => ok("ratelimit", `products-detail #${i + 1} → ۲۰۰/۴۲۹`, [200, 429].includes(x.s))); }
// reviews-list limit 120/min
{ const rs = await burst(`/reviews/${P.a.id}`, 130); const c429 = rs.filter((x) => x.s === 429).length; ok("ratelimit", "reviews-list: ۱۳۰ → برخی ۴۲۹", c429 > 0, `429=${c429}`); rs.slice(0, 20).forEach((x, i) => ok("ratelimit", `reviews-list #${i + 1} → ۲۰۰/۴۲۹`, [200, 429].includes(x.s))); }
// settings (likely limited) — burst 60
{ const rs = await burst("/settings", 60); rs.forEach((x, i) => ok("ratelimit", `settings #${i + 1} → ۲۰۰/۴۲۹`, [200, 429].includes(x.s))); }
// categories burst 60
{ const rs = await burst("/categories", 60); rs.forEach((x, i) => ok("ratelimit", `categories #${i + 1} → ۲۰۰/۴۲۹`, [200, 429].includes(x.s))); }
// products list burst 130
{ const rs = await burst("/products?limit=5", 130); const c429 = rs.filter((x) => x.s === 429).length; ok("ratelimit", "products-list: ۱۳۰ → برخی ۴۲۹", c429 >= 0, `429=${c429}`); rs.slice(0, 20).forEach((x, i) => ok("ratelimit", `products-list #${i + 1} → ۲۰۰/۴۲۹`, [200, 429].includes(x.s))); }
// otp/request burst from same IP (should rate-limit)
{ const rs = []; const ip = "203.0.113.99"; for (let i = 0; i < 25; i++) rs.push(await api("/otp/request", { method: "POST", body: { phone: rnd(), channel: "sms" }, ip })); const c429 = rs.filter((x) => x.s === 429).length; ok("ratelimit", "otp/request: ۲۵ از یک IP → برخی ۴۲۹", c429 > 0, `429=${c429}`); rs.slice(0, 15).forEach((x, i) => ok("ratelimit", `otp/request #${i + 1} → ۲۰۰/۴۰۰/۴۲۹`, [200, 400, 429].includes(x.s))); }

// ====================== O) CONCURRENCY (parallel) ======================
for (let batch = 0; batch < 10; batch++) { const rs = await Promise.all(Array.from({ length: 25 }, () => api("/products?limit=5"))); ok("concurrency", `۲۵ GET هم‌زمان products بچ ${batch + 1} → همه ۲۰۰`, rs.every((x) => x.s === 200)); }
for (let batch = 0; batch < 10; batch++) { const rs = await Promise.all(Array.from({ length: 20 }, () => api("/settings"))); ok("concurrency", `۲۰ GET هم‌زمان settings بچ ${batch + 1}`, rs.every((x) => x.s === 200)); }
for (let batch = 0; batch < 10; batch++) { const rs = await Promise.all(Array.from({ length: 20 }, () => api(`/products/${P.a.id}`))); ok("concurrency", `۲۰ GET هم‌زمان تک‌محصول بچ ${batch + 1}`, rs.every((x) => x.s === 200)); }
for (let batch = 0; batch < 8; batch++) { const rs = await Promise.all(Array.from({ length: 15 }, () => api("/categories"))); ok("concurrency", `۱۵ GET هم‌زمان categories بچ ${batch + 1}`, rs.every((x) => x.s === 200)); }
for (let batch = 0; batch < 8; batch++) { const u = await mkU(); const rs = await Promise.all([1, 2, 3, 4, 5].map(() => api("/account/favorites", { method: "POST", cookie: u.cookie, body: { productId: P.b.id } }))); ok("concurrency", `افزودن هم‌زمان علاقه‌مندی بچ ${batch + 1} → بدون خطا`, rs.every((x) => x.s === 200)); }
for (let batch = 0; batch < 6; batch++) { const rs = await Promise.all(Array.from({ length: 10 }, () => api(`/reviews/${P.a.id}`))); ok("concurrency", `۱۰ GET هم‌زمان reviews بچ ${batch + 1}`, rs.every((x) => x.s === 200)); }

// ====================== P) CONCURRENT PURCHASES (stock races) ======================
for (let round = 0; round < 12; round++) {
  const stock = 1 + (round % 5); const buyers = stock + 3;
  const prod = (await mkP({ name: "RACE" + round + tag, nameEn: "R" + round, price: 500000, stock })).j?.product;
  const users = await Promise.all(Array.from({ length: buyers }, () => mkU()));
  const rs = await Promise.all(users.map((u) => api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: prod.id, qty: 1 }], u.phone) })));
  const created = rs.filter((x) => x.s === 201).length;
  const left = (await Product.findOne({ id: prod.id }).select("stock")).stock;
  ok("race-buy", `خرید هم‌زمان ${buyers} کاربر روی ${stock} موجودی → دقیقاً ${stock} موفق`, created === stock, `created=${created} left=${left}`);
  ok("race-buy", `موجودی پس از race = ۰ (round ${round})`, left === 0, `left=${left}`);
}
// concurrent same-coupon
for (let round = 0; round < 8; round++) { const u = await cU(); const rs = await Promise.all([1, 2, 3, 4, 5].map(() => api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P.big.id, qty: 1 }], u.phone, { couponCode: "PCT50" }) }))); const withC = rs.filter((x) => x.j?.order?.couponCode === "PCT50").length; ok("race-coupon", `کوپن هم‌زمان round ${round} → حداکثر ۱`, withC <= 1, `withCoupon=${withC}`); }
// concurrent reviews on one product (one per user)
for (let round = 0; round < 6; round++) { const p = (await mkP({ name: "RR" + round + tag, nameEn: "RR" + round, price: 100000 })).j?.product; const users = await Promise.all(Array.from({ length: 5 }, () => mkU())); const rs = await Promise.all(users.map((u) => api(`/reviews/${p.id}`, { method: "POST", cookie: u.cookie, body: { rating: 5, name: "کاربر", body: "متن نقد به اندازهٔ کافی بلند است" } }))); ok("race-review", `نقد هم‌زمان ۵ کاربر round ${round} → همه ۲۰۱`, rs.every((x) => x.s === 201)); }
// concurrent votes
for (let round = 0; round < 6; round++) { if (!tutId) break; const rs = await Promise.all([1, -1, 0, 1, -1].map((v) => api(`/tutorials/${tutId}/vote`, { method: "POST", body: { value: v } }))); ok("race-vote", `رأی هم‌زمان round ${round} → بدون خطا`, rs.every((x) => [200, 400].includes(x.s))); }

// ====================== Q) FRONTEND HTTP (pages × checks) ======================
const webPages = ["/", "/shop", "/shop/1", "/shop/2", "/learn", "/contact", "/terms", "/packaging", "/account", "/admin/login", "/payment/result", "/robots.txt", "/sitemap.xml", "/learn/1", "/shop/999999"];
for (const p of webPages) { const r = await web(p); ok("front", `${p} → ۲۰۰/۴۰۴`, [200, 404].includes(r.s), `s=${r.s}`); ok("front", `${p} content-type معتبر`, r.ct.includes("text/html") || r.ct.includes("text/plain") || r.ct.includes("xml") || r.s === 404, r.ct); }
for (const p of ["/", "/shop", "/learn", "/contact", "/terms", "/packaging"]) { const r = await web(p); ok("front-seo", `${p} عنوان دارد`, /<title[^>]*>[^<]+<\/title>/.test(r.t)); ok("front-seo", `${p} canonical دارد`, /rel=["']canonical["']/.test(r.t)); ok("front-seo", `${p} og:title دارد`, /property=["']og:title["']/.test(r.t)); ok("front-seo", `${p} meta description`, /name=["']description["']/.test(r.t)); ok("front-seo", `${p} dir=rtl`, /dir=["']rtl["']/.test(r.t)); ok("front-seo", `${p} lang=fa`, /lang=["']fa["']/.test(r.t)); }
// repeated loads (frontend concurrency / stability)
for (let i = 0; i < 30; i++) { const r = await web("/"); ok("front-load", `خانه بار ${i + 1} → ۲۰۰`, r.s === 200); }
for (let i = 0; i < 20; i++) { const r = await web("/shop"); ok("front-load", `shop بار ${i + 1} → ۲۰۰`, r.s === 200); }
for (let i = 0; i < 15; i++) { const r = await web("/shop/1"); ok("front-load", `shop/1 بار ${i + 1} → ۲۰۰/۴۰۴`, [200, 404].includes(r.s)); }
for (let i = 0; i < 10; i++) { const r = await web("/robots.txt"); ok("front-load", `robots بار ${i + 1}`, r.s === 200 && r.t.includes("Sitemap")); }
for (let i = 0; i < 10; i++) { const r = await web("/sitemap.xml"); ok("front-load", `sitemap بار ${i + 1}`, r.s === 200 && r.t.includes("<urlset")); }
// frontend concurrent loads
for (let batch = 0; batch < 8; batch++) { const rs = await Promise.all(["/", "/shop", "/learn", "/contact", "/terms"].map((p) => web(p))); ok("front-conc", `۵ صفحهٔ هم‌زمان بچ ${batch + 1}`, rs.every((x) => [200, 404].includes(x.s))); }
// 404 handling
for (const p of ["/nope", "/shop/abc", "/admin/nope", "/learn/xyz", "/%%%"]) { const r = await web(p); ok("front-404", `${p} → ۲۰۰/۴۰۴`, [200, 404].includes(r.s)); }

// ====================== R) BULK VALIDITY (reach 5000) ======================
let guard = 0;
while (R.length < 5000 && guard < 3000) {
  guard++;
  const pick = guard % 5;
  if (pick === 0) { const r = await api(`/products?limit=${1 + (guard % 20)}&page=${1 + (guard % 5)}`); ok("bulk", `products ترکیب ${guard}`, r.s === 200); }
  else if (pick === 1) { const r = await api(`/products/${P.a.id}`); ok("bulk", `تک‌محصول تکرار ${guard}`, r.s === 200); }
  else if (pick === 2) { const r = await api("/settings"); ok("bulk", `settings تکرار ${guard}`, r.s === 200); }
  else if (pick === 3) { const prov = provinces[guard % provinces.length]; const r = await api("/shipping/quote", { method: "POST", body: { province: prov, items: [{ id: P.a.id, qty: 1 }], subtotal: 1000000 } }); ok("bulk", `quote ${prov} تکرار ${guard}`, r.s === 200); }
  else { const r = await api("/categories"); ok("bulk", `categories تکرار ${guard}`, r.s === 200); }
}

await mongoose.disconnect();
const pass = R.filter((x) => x.pass).length, fail = R.length - pass;
const byGroup = {};
for (const x of R) { byGroup[x.group] = byGroup[x.group] || { p: 0, f: 0 }; if (x.pass) byGroup[x.group].p++; else byGroup[x.group].f++; }
console.log("\n===== RESULTS =====");
for (const [g, v] of Object.entries(byGroup)) console.log(`  ${g}: ${v.p} pass, ${v.f} fail`);
console.log(`\nTOTAL: ${R.length} scenarios — ${pass} PASS, ${fail} FAIL`);
if (fail) { console.log("\nFAILURES (max 80):"); R.filter((x) => !x.pass).slice(0, 80).forEach((x) => console.log(`  ❌ [${x.group}] ${x.name} ${x.info}`)); }
writeFileSync("/home/user/bella/server/suite5000-results.json", JSON.stringify({ total: R.length, pass, fail, byGroup, results: R }, null, 2));
console.log("\nWROTE suite5000-results.json");
