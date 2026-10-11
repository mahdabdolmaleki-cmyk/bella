// تأیید: برای یک مشتریِ ۵ ستاره، همهٔ منابعِ دادهٔ فاکتور — سفارش (toDTO که
// فاکتورِ مشتری و ادمین از آن می‌خوانند)، /payment/status (صفحهٔ نتیجهٔ پرداخت)
// و /shipping/quote (پیش‌نمایشِ سبد) — همهٔ مزایای ستاره را کامل دارند.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const BASE = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");
const { default: Settings } = await import("./src/models/Settings.js");

// ۵ ستاره؛ تجمعی → سطح ۵ همهٔ چهار مزیت را دارد.
const s = await Settings.getSingleton();
s.starsConfigJson = JSON.stringify([
  { points: 1, title: "ستارهٔ ۱", desc: "", perks: ["freeship"] },
  { points: 2, title: "ستارهٔ ۲", desc: "", perks: ["vipbox"] },
  { points: 3, title: "ستارهٔ ۳", desc: "", perks: ["gift"] },
  { points: 4, title: "ستارهٔ ۴", desc: "", perks: ["discount"], discountType: "percent", discountPercent: 10 },
  { points: 5, title: "ستارهٔ ۵", desc: "", perks: ["discount"], discountType: "percent", discountPercent: 15 },
]);
s.vipBoxEnabled = "1";
s.vipBoxFee = "50000";
s.shippingFreeThreshold = "999999999";
s.firstPurchaseDiscountEnabled = "0";
s.couponEnabled = "0";
await s.save();
await new Promise((r) => setTimeout(r, 5200)); // انقضای کشِ تنظیماتِ سرور

const prod = await Product.create({
  id: 500000 + Math.floor(Math.random() * 99999), name: "محصول تست ۵ ستاره", nameEn: "five star",
  price: 1000000, stock: 100, points: 5, active: true,
});

async function api(p, opt = {}) {
  const r = await fetch(BASE + p, { method: opt.method || "GET", headers: { "Content-Type": "application/json", ...(opt.cookie ? { Cookie: opt.cookie } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}

const phone = "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const u = await User.create({ name: "پنج ستاره", phone, tokenVersion: 0, points: 5 });
const cookie = "bella_token=" + sign({ sub: String(u._id), tv: 0 });

// ۱) پیش‌نمایشِ سبد (shipping/quote) — باید تخفیفِ ستاره را نشان دهد.
const q = await api("/shipping/quote", { method: "POST", cookie, body: { province: "تهران", items: [{ id: prod.id, qty: 1 }] } });

// ۲) ثبت سفارش.
const r = await api("/orders", { method: "POST", cookie, body: {
  customerName: "مشتری", phone, email: "t@t.com", province: "تهران", city: "تهران", postalCode: "1234567890",
  address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", termsAccepted: true,
  items: [{ id: prod.id, qty: 1 }], shippingMethod: "tipax", vipBox: false,
} });
const o = r.j?.order;

// ۳) صفحهٔ نتیجهٔ پرداخت (payment/status).
const st = await api("/payment/status/" + encodeURIComponent(o?.code || ""), { cookie });

const keysOf = (arr) => (arr || []).map((p) => p.key).sort().join(",");
const chk = [];
chk.push(["سطح ستاره = ۵", o?.starLevel === 5]);
chk.push(["سفارش/فاکتور: هر ۴ مزیت (discount,freeship,gift,vipbox)", keysOf(o?.starPerksApplied) === "discount,freeship,gift,vipbox"]);
chk.push(["payment/status: هر ۴ مزیت را دارد", keysOf(st.j?.starPerksApplied) === "discount,freeship,gift,vipbox"]);
chk.push(["payment/status: discountSource='star'", st.j?.discountSource === "star"]);
chk.push(["shipping/quote: تخفیف از ستاره (source='star')", q.j?.discount?.source === "star"]);
chk.push(["shipping/quote: درصدِ تخفیفِ ستاره = ۱۵", q.j?.discount?.percent === 15]);

console.log("=== مشتریِ ۵ ستاره — منابعِ دادهٔ فاکتور ===");
console.log("سفارش  starPerksApplied:", keysOf(o?.starPerksApplied), "| discountSource:", o?.discountSource);
console.log("status starPerksApplied:", keysOf(st.j?.starPerksApplied), "| discountSource:", st.j?.discountSource);
console.log("quote  discount:", JSON.stringify(q.j?.discount));
console.log("\n=== نتایج ===");
let allOk = true;
for (const [name, ok] of chk) { allOk = allOk && ok; console.log((ok ? "✅" : "❌") + " " + name); }
console.log(allOk ? "\n🟢 همهٔ فاکتورها دادهٔ کاملِ مزایای ستاره دارند." : "\n🔴 مورد/مواردی شکست خورد.");
await mongoose.disconnect();
process.exit(allOk ? 0 : 1);
