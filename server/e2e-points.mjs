// تست سرتاسری (end-to-end) رفع باگ امتیاز — از طریق HTTP واقعی.
// پرداخت دقیقاً مثل routes/payment.js شبیه‌سازی می‌شود (findOneAndUpdate +
// awardOrderPoints)، سپس endpoint واقعی /api/account/loyalty صدا زده می‌شود تا
// آنچه مشتری در صفحهٔ وفاداری می‌بیند بررسی شود.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { awardOrderPoints } from "./src/models/Order.js";

const BASE = "http://127.0.0.1:4000/api";
const MONGO = "mongodb://127.0.0.1:27017/bella_test";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });

await mongoose.connect(MONGO);
const { default: User } = await import("./src/models/User.js");
const { default: Order, ORDER_STATUSES } = await import("./src/models/Order.js");

const phone = "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const user = await User.create({ name: "مشتری E2E", phone, tokenVersion: 0, points: 0 });
const cookie = "bella_token=" + sign({ sub: String(user._id), tv: 0 });

const order = await Order.create({
  code: "E2E-" + Date.now(),
  customerName: "مشتری E2E",
  phone,
  address: "تهران",
  user: user._id,
  items: [
    { id: 1, name: "محصول الف", price: 500000, qty: 2, points: 25 },
    { id: 2, name: "محصول ب", price: 200000, qty: 1, points: 10 },
  ],
  subtotal: 1200000,
  total: 1200000,
  status: ORDER_STATUSES[0],
  paymentStatus: "unpaid",
  stockCommitted: true,
});

async function loyalty() {
  const res = await fetch(BASE + "/account/loyalty", { headers: { Cookie: cookie } });
  return { s: res.status, j: await res.json().catch(() => null) };
}

const before = await loyalty();

// === دقیقاً توالی payment.js پس از اصلاح ===
const paidOrder = await Order.findOneAndUpdate(
  { _id: order._id, paymentStatus: { $in: ["unpaid", "pending"] }, stockCommitted: true },
  { $set: { paymentStatus: "paid", refId: "E2EREF", paidAt: new Date() } },
  { new: true }
);
await awardOrderPoints(paidOrder);

const after = await loyalty();

console.log("--------------------------------------------------");
console.log("GET /account/loyalty قبل از پرداخت → status", before.s, "points =", before.j?.points);
console.log("GET /account/loyalty بعد از پرداخت  → status", after.s, "points =", after.j?.points, "star =", after.j?.star);
console.log("--------------------------------------------------");
const pass = before.j?.points === 0 && after.j?.points === 60;
console.log(pass ? "✅ E2E پاس: مشتری پس از پرداخت ۶۰ امتیاز در صفحهٔ وفاداری می‌بیند." : "❌ E2E شکست.");

await mongoose.disconnect();
process.exit(pass ? 0 : 1);
