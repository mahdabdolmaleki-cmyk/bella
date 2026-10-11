// بررسی endpoint وفاداری پس از تغییرات: referralCount، perks آرایه‌ای،
// تخفیف درصدی/مبلغی، و ساخت خودکار کد معرف.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const BASE = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const { default: User } = await import("./src/models/User.js");
const { default: Settings } = await import("./src/models/Settings.js");

// تنظیم ستاره‌ها با تخفیف مبلغی در ستارهٔ ۲ برای تست.
const s = await Settings.getSingleton();
s.starsConfigJson = JSON.stringify([
  { points: 1, title: "ستارهٔ ۱", desc: "خرید اول", perks: ["freeship"] },
  { points: 5, title: "ستارهٔ ۲", desc: "ویژه", perks: ["vipbox", "discount"], discountType: "amount", discountAmount: 50000 },
]);
await s.save();

// کاربر A (معرف) با ۶ امتیاز → ستارهٔ ۲
const A = await User.create({ name: "معرف", phone: "09121110001", tokenVersion: 0, points: 6, referralCode: "BLTESTA1" });
// کاربر B که با کد A ثبت‌نام کرده (referredBy = A)
await User.create({ name: "زیرمجموعه", phone: "09121110002", tokenVersion: 0, points: 0, referredBy: A._id });
// کاربر C بدون کد معرف — باید خودکار کد بگیرد
const C = await User.create({ name: "بدون کد", phone: "09121110003", tokenVersion: 0, points: 0 });

async function loyalty(user) {
  const cookie = "bella_token=" + sign({ sub: String(user._id), tv: 0 });
  const r = await fetch(BASE + "/account/loyalty", { headers: { Cookie: cookie } });
  return r.json();
}

const a = await loyalty(A);
const c = await loyalty(C);

let pass = 0, fail = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "✅" : "❌"} ${n}${extra ? " — " + extra : ""}`); cond ? pass++ : fail++; };

console.log("پاسخ کاربر A:", JSON.stringify({ points: a.points, star: a.star, perks: a.perks, discountPercent: a.discountPercent, discountAmount: a.discountAmount, referralCode: a.referralCode, referralCount: a.referralCount }));
ok("referralCount کاربر A = ۱", a.referralCount === 1, `actual=${a.referralCount}`);
ok("perks آرایه است", Array.isArray(a.perks), `perks=${JSON.stringify(a.perks)}`);
ok("perks شامل freeship/vipbox/discount", ["freeship", "vipbox", "discount"].every((k) => a.perks.includes(k)));
ok("discountAmount = 50000 (تخفیف مبلغی)", a.discountAmount === 50000, `actual=${a.discountAmount}`);
ok("star = 2", a.star === 2, `actual=${a.star}`);
ok("کاربر C کد معرف خودکار گرفت", typeof c.referralCode === "string" && c.referralCode.length > 0, `code=${c.referralCode}`);
ok("referralCount کاربر C = ۰", c.referralCount === 0);

console.log(`\nنتیجه: ${pass} پاس / ${fail} خطا`);
await mongoose.disconnect();
process.exit(fail === 0 ? 0 : 1);
