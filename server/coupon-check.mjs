// تأیید: GET /api/account/coupons کدهای تخفیفِ کاربر را با وضعیت برمی‌گرداند.
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "./src/models/User.js";
import ReferralCode from "./src/models/ReferralCode.js";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const u = await User.create({ phone: "09" + String(Math.floor(1e9 + Math.random() * 8e9)).slice(0, 9), name: "تست کد", tokenVersion: 0 });
const cookie = "bella_token=" + sign({ sub: String(u._id), tv: 0 });

const day = 24 * 60 * 60 * 1000;
await ReferralCode.create([
  { code: "ZACTIVE1", owner: u._id, kind: "referee", percent: 10, amount: 0, used: false, expiresAt: new Date(Date.now() + 5 * day) },
  { code: "RUSED2", owner: u._id, kind: "referrer", percent: 0, amount: 50000, used: true, expiresAt: new Date(Date.now() + 5 * day) },
  { code: "ZEXPIRED3", owner: u._id, kind: "referee", percent: 15, amount: 0, used: false, expiresAt: new Date(Date.now() - 2 * day) },
]);

const r = await fetch("http://127.0.0.1:4000/api/account/coupons", { headers: { Cookie: cookie } });
const j = await r.json();
const chk = [];
chk.push(["HTTP 200", r.status === 200]);
chk.push(["۳ کد برمی‌گردد", (j.coupons || []).length === 3]);
const by = (c) => (j.coupons || []).find((x) => x.code === c);
chk.push(["کد فعال status=active", by("ZACTIVE1")?.status === "active"]);
chk.push(["کد استفاده‌شده status=used", by("RUSED2")?.status === "used"]);
chk.push(["کد منقضی status=expired", by("ZEXPIRED3")?.status === "expired"]);
chk.push(["درصد درست", by("ZACTIVE1")?.percent === 10]);
chk.push(["مبلغ درست", by("RUSED2")?.amount === 50000]);

// کاربر بدون کد → لیست خالی
const u2 = await User.create({ phone: "09" + String(Math.floor(1e9 + Math.random() * 8e9)).slice(0, 9), name: "بدون کد", tokenVersion: 0 });
const r2 = await fetch("http://127.0.0.1:4000/api/account/coupons", { headers: { Cookie: "bella_token=" + sign({ sub: String(u2._id), tv: 0 }) } });
const j2 = await r2.json();
chk.push(["کاربر بدون کد → آرایه خالی", r2.status === 200 && Array.isArray(j2.coupons) && j2.coupons.length === 0]);

console.log("=== نتایج ===");
let ok = true;
for (const [n, p] of chk) { ok = ok && p; console.log((p ? "✅" : "❌") + " " + n); }
console.log(ok ? "\n🟢 بخش کدهای تخفیف درست کار می‌کند." : "\n🔴 شکست.");
await mongoose.disconnect();
process.exit(ok ? 0 : 1);
