// تأیید: سفارش، مزایای ستارهٔ اعمال‌شده + منبع هرکدام (ستارهٔ چندم) و منبعِ
// تخفیف را ذخیره می‌کند و در پاسخِ فاکتور برمی‌گرداند.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const BASE = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");
const { default: Settings } = await import("./src/models/Settings.js");
const { default: Order } = await import("./src/models/Order.js");

const s = await Settings.getSingleton();
s.starsConfigJson = JSON.stringify([
  { points: 5,  title: "ستارهٔ ۱", desc: "", perks: ["freeship"] },
  { points: 10, title: "ستارهٔ ۲", desc: "", perks: ["vipbox"] },
  { points: 15, title: "ستارهٔ ۳", desc: "", perks: ["discount", "gift"], discountType: "percent", discountPercent: 10 },
]);
s.vipBoxEnabled = "1";
s.vipBoxFee = "50000";
s.shippingFreeThreshold = "999999999";
s.firstPurchaseDiscountEnabled = "0";
s.couponEnabled = "0";
await s.save();
// کشِ تنظیماتِ سرور TTL=۵s دارد و از اتصالِ جدا باطلال نمی‌شود؛ کمی صبر می‌کنیم
// تا سرور پیکربندی تازه را بخواند.
await new Promise((r) => setTimeout(r, 5200));

const prod = await Product.create({
  id: 600000 + Math.floor(Math.random() * 99999), name: "محصول تست فاکتور", nameEn: "invoice perks",
  price: 1000000, stock: 100, points: 5, active: true,
});

async function api(p, opt = {}) {
  const r = await fetch(BASE + p, { method: opt.method || "GET", headers: { "Content-Type": "application/json", ...(opt.cookie ? { Cookie: opt.cookie } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}

// کاربر ستارهٔ ۳ (۱۵ امتیاز) — بدونِ انتخاب باکس VIP.
const phone = "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const u = await User.create({ name: "ستارهٔ ۳", phone, tokenVersion: 0, points: 15 });
const r = await api("/orders", { method: "POST", cookie: "bella_token=" + sign({ sub: String(u._id), tv: 0 }), body: {
  customerName: "مشتری", phone, email: "t@t.com", province: "تهران", city: "تهران", postalCode: "1234567890",
  address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", termsAccepted: true,
  items: [{ id: prod.id, qty: 1 }], shippingMethod: "tipax", vipBox: false,
} });
const o = r.j?.order;

console.log("=== پاسخ فاکتور (starPerksApplied / discountSource) ===");
console.log("starLevel:", o?.starLevel);
console.log("discountSource:", o?.discountSource);
console.log("starPerksApplied:", JSON.stringify(o?.starPerksApplied, null, 2));

// بررسی از دیتابیس (toInvoice) هم.
const dbOrder = await Order.findById(o?._id || (await Order.findOne({ user: u._id }).sort({ createdAt: -1 }))._id);
const inv = dbOrder.toDTO();

const src = {};
for (const p of o?.starPerksApplied || []) src[p.key] = p;
const chk = [];
chk.push(["freeship از ستارهٔ ۱", src.freeship?.star === 1 && src.freeship?.title === "ستارهٔ ۱"]);
chk.push(["vipbox از ستارهٔ ۲", src.vipbox?.star === 2 && src.vipbox?.title === "ستارهٔ ۲"]);
chk.push(["gift از ستارهٔ ۳", src.gift?.star === 3 && src.gift?.title === "ستارهٔ ۳"]);
chk.push(["discount از ستارهٔ ۳", src.discount?.star === 3 && src.discount?.title === "ستارهٔ ۳"]);
chk.push(["discountSource === 'star'", o?.discountSource === "star"]);
chk.push(["toInvoice هم starPerksApplied دارد", Array.isArray(inv.starPerksApplied) && inv.starPerksApplied.length === 4]);
chk.push(["toInvoice discountSource === 'star'", inv.discountSource === "star"]);

console.log("\n=== نتایج ===");
let allOk = true;
for (const [name, ok] of chk) { allOk = allOk && ok; console.log((ok ? "✅" : "❌") + " " + name); }
console.log(allOk ? "\n🟢 فاکتور منبعِ هر مزیتِ ستاره را درست دارد." : "\n🔴 مورد/مواردی شکست خورد.");
await mongoose.disconnect();
process.exit(allOk ? 0 : 1);
