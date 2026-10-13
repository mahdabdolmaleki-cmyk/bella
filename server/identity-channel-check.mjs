// تأییدِ ⑧: تغییرِ مشخصات فقط با یک کانالِ انتخابی (پیامک یا ایمیل)، نه هر دو.
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "./src/models/User.js";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });
const BASE = "http://127.0.0.1:4000";

await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");

const rndPhone = () => "09" + String(Math.floor(1e9 + Math.random() * 8e9)).slice(0, 9);
async function mkUser() {
  const phone = rndPhone();
  const email = `id${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  const u = await User.create({ phone, email, name: "تست هویت", tokenVersion: 0, emailVerified: true, phoneVerified: true });
  return { cookie: "bella_token=" + sign({ sub: String(u._id), tv: 0 }), phone, email };
}
async function post(path, cookie, body) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}

const chk = [];
const push = (n, p) => chk.push([n, p]);

// ۱) تغییرِ ایمیل (کاربر هم شماره دارد هم ایمیل) → مرحلهٔ فعلی باید با ایمیل باشد، نه پیامک.
{
  const { cookie } = await mkUser();
  const newEmail = `new${Date.now()}@example.com`;
  const req = await post("/api/auth/me/identity/request-otp", cookie, { field: "email", value: newEmail, stage: "current" });
  push("تغییرِ ایمیل → کدِ مرحلهٔ فعلی با ایمیل (تک‌کاناله، نه پیامک)", req.status === 200 && req.j.channel === "email");
  const ver = await post("/api/auth/me/identity/verify-otp", cookie, { field: "email", value: newEmail, stage: "current", code: req.j.devCode });
  push("تأییدِ مرحلهٔ فعلی", ver.status === 200 && Boolean(ver.j.ticket));
  const dest = await post("/api/auth/me/identity/request-otp", cookie, { field: "email", value: newEmail, stage: "destination", currentTicket: ver.j.ticket });
  push("مقصد هم با ایمیل (کلِ جریان یک کانال)", dest.status === 200 && dest.j.channel === "email");
  const ver2 = await post("/api/auth/me/identity/verify-otp", cookie, { field: "email", value: newEmail, stage: "destination", code: dest.j.devCode });
  push("تأییدِ مقصد", ver2.status === 200 && Boolean(ver2.j.ticket));
  const pr = await fetch(BASE + "/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ email: newEmail, emailTicket: ver2.j.ticket }) });
  const pj = await pr.json().catch(() => ({}));
  push("ایمیل واقعاً تغییر کرد", pr.status === 200 && pj.user?.email === newEmail);
}

// ۲) تغییرِ شماره → مرحلهٔ فعلی با پیامک.
{
  const { cookie } = await mkUser();
  const newPhone = rndPhone();
  const req = await post("/api/auth/me/identity/request-otp", cookie, { field: "phone", value: newPhone, stage: "current" });
  push("تغییرِ شماره → کدِ مرحلهٔ فعلی با پیامک", req.status === 200 && req.j.channel === "sms");
}

// ۳) انتخابِ دستیِ پیامک برای تغییرِ ایمیل → کانالِ پیامک؛ و مصرفِ درستِ currentTicket.
{
  const { cookie } = await mkUser();
  const newEmail = `ov${Date.now()}@example.com`;
  const req = await post("/api/auth/me/identity/request-otp", cookie, { field: "email", value: newEmail, stage: "current", channel: "sms" });
  push("انتخابِ پیامک برای تغییرِ ایمیل → کانالِ پیامک", req.status === 200 && req.j.channel === "sms");
  const ver = await post("/api/auth/me/identity/verify-otp", cookie, { field: "email", value: newEmail, stage: "current", code: req.j.devCode, channel: "sms" });
  push("تأییدِ فعلی با کانالِ پیامکی", ver.status === 200 && Boolean(ver.j.ticket));
  const dest = await post("/api/auth/me/identity/request-otp", cookie, { field: "email", value: newEmail, stage: "destination", currentTicket: ver.j.ticket, channel: "sms" });
  push("مقصد با currentTicketِ پیامکی مصرف و به ایمیلِ جدید ارسال می‌شود", dest.status === 200 && dest.j.channel === "email");
}

console.log("=== نتایجِ تأییدِ تک‌کاناله ===");
let ok = true;
for (const [n, p] of chk) { ok = ok && p; console.log((p ? "✅" : "❌") + " " + n); }
console.log(ok ? "\n🟢 تغییرِ مشخصات با یک کانالِ انتخابی درست کار می‌کند." : "\n🔴 شکست.");
await mongoose.disconnect();
process.exit(ok ? 0 : 1);
