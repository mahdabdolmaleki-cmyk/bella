// اثبات: وقتی کاربر به هر ستاره‌ای می‌رسد، مزایای تجمعیِ آن ستاره
// به‌صورت خودکار (بدونِ هیچ اقدام مشتری) روی خریدش اعمال می‌شود.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const BASE = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");
const { default: Settings } = await import("./src/models/Settings.js");

// سه ستاره با مزایای متمایز؛ آستانه‌ها ۵/۱۰/۱۵ امتیاز.
// چون starPerks تجمعی است، مزایا پله‌به‌پله روی هم انباشته می‌شوند:
//   ستارهٔ ۱ → freeship
//   ستارهٔ ۲ → + vipbox
//   ستارهٔ ۳ → + discount(۱۰٪) + gift
const s = await Settings.getSingleton();
s.starsConfigJson = JSON.stringify([
  { points: 5,  title: "ستارهٔ ۱", desc: "", perks: ["freeship"] },
  { points: 10, title: "ستارهٔ ۲", desc: "", perks: ["vipbox"] },
  { points: 15, title: "ستارهٔ ۳", desc: "", perks: ["discount", "gift"], discountType: "percent", discountPercent: 10 },
]);
s.vipBoxEnabled = "1";
s.vipBoxFee = "50000";
s.shippingFreeThreshold = "999999999"; // ارسال رایگان فقط از مزیتِ ستاره بیاید
s.firstPurchaseDiscountEnabled = "0";  // ایزوله‌سازی مزایای ستاره
s.couponEnabled = "0";
await s.save();

const prod = await Product.create({
  id: 800000 + Math.floor(Math.random() * 99999), name: "محصول تست پیشرفت ستاره", nameEn: "star progress",
  price: 1000000, stock: 1000, points: 5, active: true,
});

async function api(p, opt = {}) {
  const r = await fetch(BASE + p, { method: opt.method || "GET", headers: { "Content-Type": "application/json", ...(opt.cookie ? { Cookie: opt.cookie } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
// مشتری عمداً باکس VIP را انتخاب نمی‌کند (vipBox:false) → اگر اعمال شد، خودکار بوده.
function orderBody(phone) {
  return { customerName: "مشتری", phone, email: "t@t.com", province: "تهران", city: "تهران", postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", termsAccepted: true, items: [{ id: prod.id, qty: 1 }], shippingMethod: "tipax", vipBox: false };
}

// سناریوها: [امتیاز، سطح انتظار، freeship، vipbox، discount>۰، gift]
const cases = [
  { pts: 0,  lvl: 0, freeship: false, vipbox: false, discount: false, gift: false },
  { pts: 4,  lvl: 0, freeship: false, vipbox: false, discount: false, gift: false },
  { pts: 5,  lvl: 1, freeship: true,  vipbox: false, discount: false, gift: false },
  { pts: 9,  lvl: 1, freeship: true,  vipbox: false, discount: false, gift: false },
  { pts: 10, lvl: 2, freeship: true,  vipbox: true,  discount: false, gift: false },
  { pts: 14, lvl: 2, freeship: true,  vipbox: true,  discount: false, gift: false },
  { pts: 15, lvl: 3, freeship: true,  vipbox: true,  discount: true,  gift: true },
  { pts: 30, lvl: 3, freeship: true,  vipbox: true,  discount: true,  gift: true },
];

let allOk = true;
console.log("امتیاز | سطح | حمل | vipBox/fee | تخفیف | هدیه | نتیجه");
console.log("-------|-----|-----|-----------|-------|------|------");
for (const c of cases) {
  const phone = "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const u = await User.create({ name: "کاربر " + c.pts, phone, tokenVersion: 0, points: c.pts });
  const r = await api("/orders", { method: "POST", cookie: "bella_token=" + sign({ sub: String(u._id), tv: 0 }), body: orderBody(phone) });
  const o = r.j?.order;
  const gotFreeship = (o?.shippingCost ?? -1) === 0;
  const gotVip = o?.vipBox === true && (o?.vipBoxFee ?? -1) === 0;
  const gotDiscount = (o?.discountAmount ?? 0) > 0;
  const gotGift = o?.starGift === true;
  const ok = o?.starLevel === c.lvl && gotFreeship === c.freeship && gotVip === c.vipbox && gotDiscount === c.discount && gotGift === c.gift;
  allOk = allOk && ok;
  console.log(
    String(c.pts).padStart(6) + " | " + String(o?.starLevel).padStart(3) + " | " +
    String(o?.shippingCost).padStart(3) + " | " +
    (o?.vipBox ? "yes" : "no ") + "/" + String(o?.vipBoxFee).padStart(5) + " | " +
    String(o?.discountAmount ?? 0).padStart(5) + " | " +
    (o?.starGift ? "yes" : "no ") + " | " + (ok ? "✅" : "❌ انتظار lvl=" + c.lvl + " freeship=" + c.freeship + " vip=" + c.vipbox + " disc=" + c.discount + " gift=" + c.gift)
  );
}

console.log(allOk ? "\n🟢 همهٔ سطوح: مزایای تجمعی درست و خودکار اعمال شد." : "\n🔴 مورد/مواردی مطابق انتظار نبود.");
await mongoose.disconnect();
process.exit(allOk ? 0 : 1);
