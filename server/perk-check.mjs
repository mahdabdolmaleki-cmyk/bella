// بررسی اعمال خودکارِ مزایای ستاره در ثبت سفارش (رفتار فعلی).
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const BASE = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");
const { default: Settings } = await import("./src/models/Settings.js");

// ستارهٔ ۱ با همهٔ مزایا در آستانهٔ ۱ امتیاز؛ ارسال رایگانِ آستانه‌ای را خیلی بالا
// می‌بریم تا «ارسال رایگان» فقط از مزیتِ ستاره بیاید.
const s = await Settings.getSingleton();
s.starsConfigJson = JSON.stringify([
  { points: 1, title: "ستارهٔ ۱", desc: "", perks: ["vipbox", "freeship", "gift", "discount"], discountType: "percent", discountPercent: 10 },
]);
s.vipBoxEnabled = "1";
s.vipBoxFee = "50000";
s.shippingFreeThreshold = "999999999";
// تخفیف‌های غیرستاره‌ای را خاموش می‌کنیم تا فقط مزایای ستاره سنجیده شوند.
s.firstPurchaseDiscountEnabled = "0";
s.couponEnabled = "0";
await s.save();

const prod = await Product.create({
  id: 900000 + Math.floor(Math.random() * 99999), name: "محصول تست مزایا", nameEn: "perk test", price: 1000000,
  stock: 100, points: 5, active: true,
});

async function api(p, opt = {}) {
  const r = await fetch(BASE + p, { method: opt.method || "GET", headers: { "Content-Type": "application/json", ...(opt.cookie ? { Cookie: opt.cookie } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
function orderBody(phone, vip) {
  return { customerName: "مشتری", phone, email: "t@t.com", province: "تهران", city: "تهران", postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", termsAccepted: true, items: [{ id: prod.id, qty: 1 }], shippingMethod: "tipax", vipBox: vip };
}

// --- کاربر ستاره‌دار (۵ امتیاز → ستارهٔ ۱ با همهٔ مزایا) ---
// توجه: عمداً vipBox را انتخاب نمی‌کند (false) تا «اعمال خودکار» سنجیده شود.
const p1 = "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const u1 = await User.create({ name: "ستاره‌دار", phone: p1, tokenVersion: 0, points: 5 });
const r1 = await api("/orders", { method: "POST", cookie: "bella_token=" + sign({ sub: String(u1._id), tv: 0 }), body: orderBody(p1, false) });
const o1 = r1.j?.order;

// --- کاربر بدون ستاره (۰ امتیاز) برای مقایسه ---
const p0 = "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const u0 = await User.create({ name: "بدون ستاره", phone: p0, tokenVersion: 0, points: 0 });
const r0 = await api("/orders", { method: "POST", cookie: "bella_token=" + sign({ sub: String(u0._id), tv: 0 }), body: orderBody(p0, false) });
const o0 = r0.j?.order;

const chk = [];
chk.push(["حمل رایگانِ خودکار (shippingCost=۰)", (o1?.shippingCost ?? -1) === 0]);
chk.push(["تخفیف ستاره خودکار (>۰)", (o1?.discountAmount ?? 0) > 0]);
chk.push(["باکس VIP خودکار — بدونِ انتخاب مشتری (vipBox=true)", o1?.vipBox === true]);
chk.push(["باکس VIP رایگان (fee=۰)", (o1?.vipBoxFee ?? -1) === 0]);
chk.push(["هدیهٔ ستاره علامت خورد (starGift=true)", o1?.starGift === true]);
chk.push(["کنترل: بدون ستاره هیچ مزیتی نگرفت", (o0?.shippingCost ?? 0) > 0 && (o0?.discountAmount ?? 0) === 0 && o0?.vipBox === false && o0?.starGift === false]);

console.log("\n=== کاربر ستاره‌دار — باکس VIP را انتخاب نکرده ===");
console.log(JSON.stringify({ starLevel: o1?.starLevel, shippingCost: o1?.shippingCost, discountAmount: o1?.discountAmount, discountPercent: o1?.discountPercent, vipBox: o1?.vipBox, vipBoxFee: o1?.vipBoxFee, starGift: o1?.starGift, total: o1?.total }, null, 2));
console.log("=== کاربر بدون ستاره ===");
console.log(JSON.stringify({ starLevel: o0?.starLevel, shippingCost: o0?.shippingCost, discountAmount: o0?.discountAmount, vipBox: o0?.vipBox, vipBoxFee: o0?.vipBoxFee, starGift: o0?.starGift }, null, 2));

console.log("\n=== نتایج ===");
let allOk = true;
for (const [name, ok] of chk) { allOk = allOk && ok; console.log((ok ? "✅" : "❌") + " " + name); }
console.log(allOk ? "\n🟢 همهٔ مزایای ستاره خودکار اعمال شد." : "\n🔴 مورد/مواردی شکست خورد.");

await mongoose.disconnect();
process.exit(allOk ? 0 : 1);
