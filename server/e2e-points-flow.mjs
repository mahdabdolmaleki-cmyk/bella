// تست سرتاسری (HTTP واقعی): ثبت سفارش از مسیر API → امتیاز فوری در «در انتظار
// تأیید» (بدون پرداخت) → لغو از پنل مدیر → کسر امتیاز.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const BASE = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const SA_PHONE = "09120000000", SA_EMAIL = "admin@test.local";
const SA_SID = crypto.createHash("sha256").update(`${SA_PHONE}\0${SA_EMAIL}`, "utf8").digest("hex");
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });
const ADMIN = "bella_admin=" + sign({ superAdmin: true, adminSessionId: SA_SID });

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");

// یک محصول فعال را برمی‌داریم و امتیازش را روی ۳۰ می‌گذاریم (qty=2 → ۶۰ امتیاز).
const prod = await Product.findOne({ active: true, stock: { $gte: 5 } });
if (!prod) { console.log("❌ محصول فعالی با موجودی پیدا نشد"); process.exit(1); }
prod.points = 30;
await prod.save();

const phone = "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const user = await User.create({ name: "مشتری E2E", phone, tokenVersion: 0, points: 0 });
const cookie = "bella_token=" + sign({ sub: String(user._id), tv: 0 });

const loyalty = async () => (await fetch(BASE + "/account/loyalty", { headers: { Cookie: cookie } })).json();
async function api(p, opt = {}) {
  const r = await fetch(BASE + p, { method: opt.method || "GET", headers: { "Content-Type": "application/json", ...(opt.cookie ? { Cookie: opt.cookie } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}

const body = {
  customerName: "مشتری E2E", phone, email: "t@t.com", province: "تهران", city: "تهران",
  postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲",
  termsAccepted: true, items: [{ id: prod.id, qty: 2 }], shippingMethod: "tipax",
};
const placed = await api("/orders", { method: "POST", cookie, body });
await new Promise((r) => setTimeout(r, 350));
const afterOrder = await loyalty();
const orderId = placed.j?.order?.id;

const cancelled = await api(`/admin/orders/${orderId}`, { method: "PATCH", cookie: ADMIN, body: { status: "لغو شد" } });
await new Promise((r) => setTimeout(r, 350));
const afterCancel = await loyalty();

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✅" : "❌"} ${n}${e ? " — " + e : ""}`); c ? pass++ : fail++; };
ok("ثبت سفارش از API → ۲۰۱", placed.s === 201, `s=${placed.s} orderId=${orderId}`);
ok("امتیاز فوری پس از ثبت (بدون پرداخت) = ۶۰", afterOrder.points === 60, `points=${afterOrder.points}`);
ok("لغو توسط مدیر → ۲۰۰", cancelled.s === 200, `s=${cancelled.s}`);
ok("امتیاز پس از لغو = ۰", afterCancel.points === 0, `points=${afterCancel.points}`);

console.log(`\nنتیجه: ${pass} پاس / ${fail} خطا`);
await mongoose.disconnect();
process.exit(fail === 0 ? 0 : 1);
