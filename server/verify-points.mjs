// راستی‌آزمایی رفع باگ «امتیاز وفاداری داده نمی‌شد».
// هر تست دقیقاً همان توالی کد واقعی را بازسازی می‌کند.
import mongoose from "mongoose";
import Order, { ORDER_STATUSES, awardOrderPoints } from "./src/models/Order.js";
import User from "./src/models/User.js";

const URI = "mongodb://127.0.0.1:27017/bella_points_verify";
await mongoose.connect(URI);
await mongoose.connection.db.dropDatabase().catch(() => {});

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  cond ? pass++ : fail++;
};

const DELIVERED = ORDER_STATUSES[ORDER_STATUSES.length - 2];
const CANCELLED = ORDER_STATUSES[ORDER_STATUSES.length - 1];

async function newUser(phone) {
  return User.create({ name: "مشتری", phone, email: `${phone}@t.local`, points: 0 });
}
function items() {
  return [
    { id: 1, name: "محصول الف", price: 500000, qty: 2, points: 25 }, // 50
    { id: 2, name: "محصول ب", price: 200000, qty: 1, points: 10 }, // 10 → جمع 60
  ];
}
async function newOrder(user, code, status = ORDER_STATUSES[0], paymentStatus = "unpaid") {
  return Order.create({
    code,
    customerName: "مشتری",
    phone: user.phone,
    address: "تهران",
    user: user._id,
    items: items(),
    subtotal: 1200000,
    total: 1200000,
    status,
    paymentStatus,
    stockCommitted: true,
  });
}
const pointsOf = async (u) => (await User.findById(u._id)).points;

// ---------------------------------------------------------------------------
// تست ۰ (ریشهٔ باگ): findOneAndUpdate به‌تنهایی قلاب post("save") را اجرا
// نمی‌کند → بدون awardOrderPoints امتیاز صفر می‌ماند. این چراییِ باگ را ثابت
// می‌کند.
// ---------------------------------------------------------------------------
{
  const u = await newUser("09120000010");
  const o = await newOrder(u, "R-0");
  await Order.findOneAndUpdate(
    { _id: o._id, paymentStatus: { $in: ["unpaid", "pending"] } },
    { $set: { paymentStatus: "paid" } },
    { new: true }
  );
  await new Promise((r) => setTimeout(r, 200));
  ok("تست۰ ریشهٔ باگ: findOneAndUpdate تنها → امتیاز ۰ (قلاب save اجرا نمی‌شود)", (await pointsOf(u)) === 0);
}

// ---------------------------------------------------------------------------
// تست ۱ (رفع — پرداخت آنلاین): دقیقاً توالی payment.js پس از اصلاح.
// ---------------------------------------------------------------------------
{
  const u = await newUser("09120000011");
  const o = await newOrder(u, "P-1");
  const paidOrder = await Order.findOneAndUpdate(
    { _id: o._id, paymentStatus: { $in: ["unpaid", "pending"] }, stockCommitted: true },
    { $set: { paymentStatus: "paid", refId: "REF1", paidAt: new Date() } },
    { new: true }
  );
  const awarded = await awardOrderPoints(paidOrder); // ← همان فراخوانی که به payment.js اضافه شد
  ok("تست۱ پرداخت آنلاین → ۶۰ امتیاز", (await pointsOf(u)) === 60, `awarded=${awarded}, points=${await pointsOf(u)}`);
}

// ---------------------------------------------------------------------------
// تست ۲ (idempotency): دوبار پشت‌سرهم + هم‌زمان → فقط یک‌بار امتیاز.
// ---------------------------------------------------------------------------
{
  const u = await newUser("09120000012");
  const o = await newOrder(u, "P-2");
  const paidOrder = await Order.findOneAndUpdate(
    { _id: o._id, paymentStatus: { $in: ["unpaid", "pending"] } },
    { $set: { paymentStatus: "paid" } },
    { new: true }
  );
  const results = await Promise.all([
    awardOrderPoints(paidOrder),
    awardOrderPoints(paidOrder),
    awardOrderPoints(paidOrder),
  ]);
  const awardedOnce = results.filter((r) => r > 0).length === 1;
  ok("تست۲ سه فراخوانی هم‌زمان → فقط یک‌بار ۶۰ امتیاز", awardedOnce && (await pointsOf(u)) === 60, `points=${await pointsOf(u)}`);
}

// ---------------------------------------------------------------------------
// تست ۳ (پس‌کرایه/تحویل): مدیر سفارش را «تحویل داده شد» می‌کند → order.save()
// → قلاب post("save") امتیاز می‌دهد.
// ---------------------------------------------------------------------------
{
  const u = await newUser("09120000013");
  const o = await newOrder(u, "C-3", ORDER_STATUSES[0], "unpaid");
  o.status = DELIVERED;
  await o.save(); // مسیر پنل مدیر (admin.js) از .save() استفاده می‌کند
  await new Promise((r) => setTimeout(r, 200));
  ok("تست۳ تحویلِ پس‌کرایه (save) → ۶۰ امتیاز", (await pointsOf(u)) === 60, `points=${await pointsOf(u)}`);
}

// ---------------------------------------------------------------------------
// تست ۴ (لغو): سفارش لغوشده هیچ امتیازی نمی‌دهد.
// ---------------------------------------------------------------------------
{
  const u = await newUser("09120000014");
  const o = await newOrder(u, "X-4", CANCELLED, "failed");
  const awarded = await awardOrderPoints(o);
  ok("تست۴ سفارش لغوشده → ۰ امتیاز", awarded === 0 && (await pointsOf(u)) === 0);
}

// ---------------------------------------------------------------------------
// تست ۵ (پرداختِ دوبارهٔ همان سفارش): pointsAwarded=true → دوباره نمی‌دهد.
// ---------------------------------------------------------------------------
{
  const u = await newUser("09120000015");
  const o = await newOrder(u, "P-5");
  const paid1 = await Order.findOneAndUpdate(
    { _id: o._id, paymentStatus: { $in: ["unpaid", "pending"] } },
    { $set: { paymentStatus: "paid" } },
    { new: true }
  );
  await awardOrderPoints(paid1);
  const fresh = await Order.findById(o._id); // pointsAwarded الان true است
  await awardOrderPoints(fresh);
  ok("تست۵ پرداخت/اهدای دوباره → هنوز ۶۰ (دوبار نمی‌دهد)", (await pointsOf(u)) === 60, `points=${await pointsOf(u)}`);
}

// ---------------------------------------------------------------------------
// تست ۶ (تجمعی): دو سفارش پرداخت‌شده → امتیاز جمع می‌شود.
// ---------------------------------------------------------------------------
{
  const u = await newUser("09120000016");
  for (const code of ["P-6a", "P-6b"]) {
    const o = await newOrder(u, code);
    const paid = await Order.findOneAndUpdate(
      { _id: o._id, paymentStatus: { $in: ["unpaid", "pending"] } },
      { $set: { paymentStatus: "paid" } },
      { new: true }
    );
    await awardOrderPoints(paid);
  }
  ok("تست۶ دو سفارش پرداخت‌شده → ۱۲۰ امتیاز", (await pointsOf(u)) === 120, `points=${await pointsOf(u)}`);
}

console.log("\n--------------------------------------------------");
console.log(`نتیجه: ${pass} پاس / ${fail} خطا`);
console.log(fail === 0 ? "✅ همهٔ تست‌های امتیاز پاس شدند." : "❌ هنوز خطا وجود دارد.");
await mongoose.disconnect();
process.exit(fail === 0 ? 0 : 1);
