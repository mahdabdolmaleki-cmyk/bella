// راستی‌آزمایی مدل جدید امتیاز:
//  - اهدا همان لحظهٔ ثبت سفارش (در انتظار تأیید)، بدون نیاز به پرداخت
//  - بازپس‌گیری هنگام لغو
//  - idempotency اهدا و بازپس‌گیری
import mongoose from "mongoose";
import Order, { ORDER_STATUSES } from "./src/models/Order.js";
import User from "./src/models/User.js";

await mongoose.connect("mongodb://127.0.0.1:27017/bella_points_flow");
await mongoose.connection.db.dropDatabase().catch(() => {});

const PENDING = ORDER_STATUSES[0];
const PREPARING = ORDER_STATUSES[1];
const CANCELLED = ORDER_STATUSES[ORDER_STATUSES.length - 1];

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "✅" : "❌"} ${n}${e ? " — " + e : ""}`); c ? pass++ : fail++; };
const pointsOf = async (u) => (await User.findById(u._id)).points;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const items60 = [
  { id: 1, name: "محصول الف", price: 500000, qty: 2, points: 25 }, // 50
  { id: 2, name: "محصول ب", price: 200000, qty: 1, points: 10 }, // 10 → 60
];
async function mkOrder(u, code, its = items60) {
  return Order.create({
    code, customerName: "مشتری", phone: u.phone, address: "تهران", user: u._id,
    items: its, subtotal: 1200000, total: 1200000,
    status: PENDING, paymentStatus: "unpaid", stockCommitted: true,
  });
}

// --- تست ۱: اهدا در ثبت، بدون پرداخت ---
{
  const u = await User.create({ name: "مشتری", phone: "09120002001", points: 0 });
  const o = await mkOrder(u, "FLOW-1");
  await sleep(250);
  ok("ثبت سفارش (در انتظار تأیید) → ۶۰ امتیاز بدون پرداخت", (await pointsOf(u)) === 60, `points=${await pointsOf(u)}`);

  // تغییر وضعیت نباید دوباره امتیاز بدهد
  o.status = PREPARING; await o.save(); await sleep(200);
  ok("تغییر وضعیت به «آماده‌سازی» → امتیاز دوباره داده نمی‌شود", (await pointsOf(u)) === 60, `points=${await pointsOf(u)}`);

  // لغو → بازپس‌گیری
  o.status = CANCELLED; await o.save(); await sleep(250);
  ok("لغو سفارش → ۶۰ امتیاز کم شد (رسید به ۰)", (await pointsOf(u)) === 0, `points=${await pointsOf(u)}`);

  // لغو/ذخیرهٔ دوباره → منفی نمی‌شود
  await o.save(); await sleep(200);
  ok("ذخیرهٔ دوبارهٔ سفارشِ لغوشده → امتیاز منفی نمی‌شود", (await pointsOf(u)) === 0, `points=${await pointsOf(u)}`);
}

// --- تست ۲: دو سفارش، لغوِ یکی ---
{
  const u = await User.create({ name: "مشتری", phone: "09120002002", points: 0 });
  const a = await mkOrder(u, "FLOW-2A");
  const b = await mkOrder(u, "FLOW-2B");
  await sleep(250);
  ok("دو سفارش ثبت‌شده → ۱۲۰ امتیاز", (await pointsOf(u)) === 120, `points=${await pointsOf(u)}`);
  a.status = CANCELLED; await a.save(); await sleep(250);
  ok("لغوِ یکی → ۶۰ امتیاز باقی می‌ماند", (await pointsOf(u)) === 60, `points=${await pointsOf(u)}`);
}

// --- تست ۳: محصول با امتیاز ۰ → هیچ امتیازی ---
{
  const u = await User.create({ name: "مشتری", phone: "09120002003", points: 0 });
  await mkOrder(u, "FLOW-3", [{ id: 9, name: "بدون امتیاز", price: 100, qty: 1, points: 0 }]);
  await sleep(200);
  ok("سفارش با محصول امتیاز-۰ → ۰ امتیاز", (await pointsOf(u)) === 0);
}

// --- تست ۴: سفارشی که مستقیم لغو ساخته شود → امتیاز نمی‌گیرد ---
{
  const u = await User.create({ name: "مشتری", phone: "09120002004", points: 0 });
  const o = await Order.create({
    code: "FLOW-4", customerName: "مشتری", phone: u.phone, address: "تهران", user: u._id,
    items: items60, subtotal: 1200000, total: 1200000,
    status: CANCELLED, paymentStatus: "unpaid", stockCommitted: true,
  });
  await sleep(200);
  ok("سفارشِ لغوشده از ابتدا → ۰ امتیاز", (await pointsOf(u)) === 0);
}

// --- تست ۵: pointsAwardedAmount درست ثبت شده ---
{
  const u = await User.create({ name: "مشتری", phone: "09120002005", points: 0 });
  const o = await mkOrder(u, "FLOW-5");
  await sleep(200);
  const fresh = await Order.findById(o._id);
  ok("pointsAwardedAmount = ۶۰ ثبت شده", fresh.pointsAwardedAmount === 60, `amount=${fresh.pointsAwardedAmount}`);
  ok("pointsAwarded = true", fresh.pointsAwarded === true);
}

console.log(`\nنتیجه: ${pass} پاس / ${fail} خطا`);
console.log(fail === 0 ? "✅ جریان جدید امتیاز درست کار می‌کند." : "❌ خطا دارد.");
await mongoose.disconnect();
process.exit(fail === 0 ? 0 : 1);
