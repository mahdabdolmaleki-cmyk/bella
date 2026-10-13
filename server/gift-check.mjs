// تأیید: انتخابِ هدیه توسط مشتریِ مشمول هنگامِ پرداخت.
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "./src/models/User.js";
import Product from "./src/models/Product.js";

const BASE = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const SA_SID = crypto.createHash("sha256").update("09120000000\0admin@test.local", "utf8").digest("hex");
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });
const ADMIN = "bella_admin=" + sign({ superAdmin: true, adminSessionId: SA_SID });

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");

async function api(p, opt = {}) {
  const r = await fetch(BASE + p, { method: opt.method || "GET", headers: { "Content-Type": "application/json", Cookie: opt.cookie || ADMIN }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
const rnd = () => String(Math.floor(1e9 + Math.random() * 8e9));

const chk = [];

// محصولات: یک هدیه + یک عادی
const gp = await api("/admin/products", { method: "POST", body: { name: "اسپری هدیه", nameEn: "Gift Spray", price: 300000, stock: 10, active: true, gift: true } });
const np = await api("/admin/products", { method: "POST", body: { name: "محصول عادی", nameEn: "Normal", price: 500000, stock: 10, active: true } });
chk.push(["محصول هدیه با gift=true ساخته شد", gp.j?.product?.gift === true]);

// endpoint عمومی /gifts
const gifts = await api("/products/gifts");
chk.push(["GET /products/gifts محصول هدیه را برمی‌گرداند", (gifts.j?.gifts || []).some((g) => g.id === gp.j.product.id)]);

// کاربر مشمول (points=20) و نامشمول (points=0)
const mkU = async (points) => {
  const u = await User.create({ phone: "09" + rnd().slice(0, 9), name: "تست", points, tokenVersion: 0 });
  return { u, cookie: "bella_token=" + sign({ sub: String(u._id), tv: 0 }) };
};
const rich = await mkU(20);
const poor = await mkU(0);

const orderBody = (giftId) => ({
  customerName: "خریدار تست", phone: "0912" + rnd().slice(0, 7), email: "t" + rnd() + "@test.local",
  province: "تهران", city: "تهران", postalCode: "1234567890", address: "خیابان ولیعصر، کوچه تست، پلاک ۱، واحد ۲",
  termsAccepted: true, items: [{ id: np.j.product.id, qty: 1 }], giftId,
});

// ۱) کاربر مشمول + giftId → هدیه اضافه می‌شود (price=0, gift=true)
const o1 = await api("/orders", { method: "POST", cookie: rich.cookie, body: orderBody(gp.j.product.id) });
const giftLine = (o1.j?.order?.items || []).find((i) => i.id === gp.j.product.id);
chk.push(["سفارشِ مشمول ثبت شد (۲۰۱)", o1.s === 201]);
chk.push(["قلم هدیه در سفارش هست", Boolean(giftLine)]);
chk.push(["قیمت هدیه ۰ است", giftLine?.price === 0]);
chk.push(["فلگ gift=true روی قلم", giftLine?.gift === true]);
chk.push(["جمع، هدیه را نمی‌شمارد", o1.j?.order?.subtotal === np.j.product.price]);

// ۲) کاربر نامشمول + giftId → هدیه اضافه نمی‌شود
const o2 = await api("/orders", { method: "POST", cookie: poor.cookie, body: orderBody(gp.j.product.id) });
const giftLine2 = (o2.j?.order?.items || []).find((i) => i.id === gp.j.product.id);
chk.push(["کاربر نامشمول هدیه نمی‌گیرد", o2.s === 201 && !giftLine2]);

// ۳) مشمول ولی giftId یک محصول غیرهدیه → هدیه اضافه نمی‌شود
const o3 = await api("/orders", { method: "POST", cookie: rich.cookie, body: orderBody(np.j.product.id) });
const giftLine3 = (o3.j?.order?.items || []).find((i) => i.gift);
chk.push(["محصول غیرهدیه به‌عنوان هدیه ثبت نمی‌شود", o3.s === 201 && !giftLine3]);

console.log("=== نتایج ===");
let ok = true;
for (const [n, p] of chk) { ok = ok && p; console.log((p ? "✅" : "❌") + " " + n); }
console.log(ok ? "\n🟢 انتخاب هدیه درست کار می‌کند." : "\n🔴 شکست.");
await mongoose.disconnect();
process.exit(ok ? 0 : 1);
