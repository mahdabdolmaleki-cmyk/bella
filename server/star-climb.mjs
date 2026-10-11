// مسیر طبیعی: یک مشتری تازه پشت‌سرهم خرید می‌کند؛ با هر خرید امتیاز می‌گیرد،
// به ستارهٔ بعدی می‌رسد و مزایای تجمعی به‌صورت خودکار روی خرید بعدی‌اش اعمال می‌شود.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const BASE = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const { default: User } = await import("./src/models/User.js");
const { default: Product } = await import("./src/models/Product.js");
const { default: Settings } = await import("./src/models/Settings.js");

// همان پیکربندی star-progress: آستانه‌ها ۵/۱۰/۱۵، هر محصول ۵ امتیاز.
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

const prod = await Product.create({
  id: 700000 + Math.floor(Math.random() * 99999), name: "محصول تست صعود ستاره", nameEn: "star climb",
  price: 1000000, stock: 1000, points: 5, active: true,
});

async function api(p, opt = {}) {
  const r = await fetch(BASE + p, { method: opt.method || "GET", headers: { "Content-Type": "application/json", ...(opt.cookie ? { Cookie: opt.cookie } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}

const phone = "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const u = await User.create({ name: "مشتری وفادار", phone, tokenVersion: 0, points: 0 });
const cookie = "bella_token=" + sign({ sub: String(u._id), tv: 0 });
const body = { customerName: "مشتری", phone, email: "t@t.com", province: "تهران", city: "تهران", postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲", termsAccepted: true, items: [{ id: prod.id, qty: 1 }], shippingMethod: "tipax", vipBox: false };

console.log("خرید | امتیازِ قبل | ستاره | حمل | vipBox | تخفیف | هدیه | امتیازِ بعد");
console.log("-----|------------|-------|-----|--------|-------|------|------------");
let prevLevel = -1, monotonic = true;
for (let n = 1; n <= 4; n++) {
  const before = (await User.findById(u._id)).points;
  const r = await api("/orders", { method: "POST", cookie, body });
  const o = r.j?.order;
  if (!o) { console.log("\n[debug] سفارش", n, "شکست: status=", r.s, "body=", JSON.stringify(r.j)); break; }
  const after = (await User.findById(u._id)).points;
  if (o.starLevel < prevLevel) monotonic = false;
  prevLevel = o.starLevel;
  const perks = [
    (o.shippingCost ?? -1) === 0 ? "حمل‌رایگان" : null,
    o.vipBox && (o.vipBoxFee ?? -1) === 0 ? "باکسVIP" : null,
    (o.discountAmount ?? 0) > 0 ? "تخفیف" + o.discountAmount : null,
    o.starGift ? "هدیه" : null,
  ].filter(Boolean).join(" + ") || "—";
  console.log(
    String(n).padStart(4) + " | " + String(before).padStart(10) + " | " + String(o.starLevel).padStart(5) +
    " | " + String(o.shippingCost).padStart(3) + " | " + (o.vipBox ? "yes" : "no ").padStart(6) +
    " | " + String(o.discountAmount ?? 0).padStart(5) + " | " + (o.starGift ? "yes" : "no ").padStart(4) +
    " | " + String(after).padStart(10) + "   ⟵ " + perks
  );
}

const final = await User.findById(u._id);
const climbed = final.points >= 15; // ۴ خرید × ۵ امتیاز = ۲۰ ≥ ۱۵ → ستارهٔ ۳
console.log("\nامتیاز نهایی مشتری:", final.points, "→ ستارهٔ", prevLevel);
console.log(climbed && monotonic
  ? "🟢 مشتری به‌صورت طبیعی صعود کرد و مزایا خودکار و یکنواخت زیاد شدند."
  : "🔴 انتظار صعود طبیعی برآورده نشد.");
await mongoose.disconnect();
process.exit(climbed && monotonic ? 0 : 1);
