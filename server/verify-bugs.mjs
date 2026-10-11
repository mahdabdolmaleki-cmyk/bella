// Targeted verification of the 5 fixed bugs — concrete before/after evidence.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const API = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const SA_SID = crypto.createHash("sha256").update("09120000000\0admin@test.local", "utf8").digest("hex");
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });
const ADMIN = "bella_admin=" + sign({ superAdmin: true, adminSessionId: SA_SID });
const rnd = () => "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const rip = () => `10.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(p, { method = "GET", body, cookie, ip } = {}) {
  const res = await fetch(API + p, { method, headers: { "Content-Type": "application/json", "X-Forwarded-For": ip || rip(), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await res.json(); } catch {} return { s: res.status, j };
}
await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");
const { default: Settings } = await import("./src/models/Settings.js");
const mkU = async () => { const phone = rnd(); const u = await User.create({ phone, name: "کاربر", tokenVersion: 0 }); return { u, phone, cookie: "bella_token=" + sign({ sub: String(u._id), tv: 0 }) }; };
const cats = await api("/categories"); const catId = cats.j?.categories?.[0]?.id ?? null;
const mkP = (p) => api("/admin/products", { method: "POST", cookie: ADMIN, body: { active: true, stock: 1000, category: catId, ...p } });
const ord = (items, phone, x = {}) => ({ customerName: "کاربر", phone, email: "t@t.com", province: "تهران", city: "تهران", postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", termsAccepted: true, items, shippingMethod: "tipax", ...x });

const tag = Date.now();
const P1 = (await mkP({ name: "ONE" + tag, nameEn: "ONE", price: 1000000 })).j?.product;
const Pbig = (await mkP({ name: "BIG" + tag, nameEn: "BIG", price: 5000000 })).j?.product;
await Settings.findOneAndUpdate({}, { $set: { couponEnabled: "1", couponCodesJson: JSON.stringify([{ code: "V50", percent: 50 }]) } }, { upsert: true });
await sleep(5500);

let allOk = true;
const check = (name, pass, detail) => { allOk = allOk && pass; console.log(`${pass ? "✅" : "❌"} ${name} — ${detail}`); };

// ===== Bug 1: invalid route id must NOT return product 1 =====
{
  const r = await api(`/products/${P1.id}`); const realId = P1.id;
  const neg = await api("/products/-5"); const zero = await api("/products/0");
  check("باگ ۱ — شناسهٔ نامعتبر مسیر", [400, 404].includes(neg.s) && [400, 404].includes(zero.s),
    `/products/-5 → ${neg.s} (نه ۲۰۰)، /products/0 → ${zero.s}؛ محصول واقعی ${realId} → ${r.s}`);
}
// ===== Bug 2: concurrent single-use coupon → only 1 =====
{
  const u = await mkU(); await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: P1.id, qty: 1 }], u.phone) }); // consume first-purchase
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: Pbig.id, qty: 1 }], u.phone, { couponCode: "V50" }) })));
  const withC = rs.filter((x) => x.j?.order?.couponCode === "V50").length;
  check("باگ ۲ — کوپن یک‌بارمصرف هم‌زمان", withC === 1, `۵ درخواست هم‌زمان → ${withC} کوپن اعمال شد (باید ۱)`);
}
// ===== Bug 3: two users with empty referralCode must both save (no E11000) =====
{
  let okc = 0, err = "";
  for (let i = 0; i < 3; i++) { try { await User.create({ phone: rnd(), name: "u" + i, tokenVersion: 0 }); okc++; } catch (e) { err = e.code === 11000 ? "E11000" : e.message; } }
  check("باگ ۳ — referralCode خالی", okc === 3, `ساخت ۳ کاربر با کد رفرال خالی → ${okc} موفق${err ? " (خطا: " + err + ")" : ""}`);
}
// ===== Bug 4: order item id -1 must NOT add product 1 =====
{
  const u = await mkU();
  const r = await api("/orders", { method: "POST", cookie: u.cookie, body: ord([{ id: -1, qty: 1 }], u.phone) });
  check("باگ ۴ — شناسهٔ کالای سفارش", r.s === 400, `سفارش با item id=-1 → ${r.s} (باید ۴۰۰، نه ۲۰۱)`);
}
// ===== Bug 5: decimal/whitespace product id → 400 =====
{
  const a = await api("/products/1.5"); const b = await api("/products/%201"); const c = await api("/products/+1");
  check("باگ ۵ — شناسهٔ اعشاری/با فاصله", [400, 404].includes(a.s) && [400, 404].includes(b.s) && [400, 404].includes(c.s),
    `/products/1.5 → ${a.s}، /products/« 1» → ${b.s}، /products/+1 → ${c.s}`);
}

await mongoose.disconnect();
console.log(allOk ? "\n🎉 همهٔ ۵ باگ رفع شده‌اند (تأیید رفتاری زنده)." : "\n⚠️ حداقل یک باگ هنوز رفع نشده.");
