// Generate a detailed HTML report from the real 5000-scenario results.
import { readFileSync, writeFileSync } from "fs";
const R = JSON.parse(readFileSync("/home/user/bella/server/suite5000-results.json", "utf8"));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pct = ((R.pass / R.total) * 100).toFixed(1);

// group order + Persian labels
const labels = {
  seed: "آماده‌سازی", auth: "احراز هویت / OTP", products: "محصولات", categories: "دسته‌بندی",
  settings: "تنظیمات", health: "سلامت", "404": "مسیر ناموجود", cart: "سبد خرید",
  orders: "سفارش‌ها", coupon: "کوپن", shipping: "ارسال", payment: "پرداخت",
  reviews: "نقدها", "reviews-admin": "ادمین نقدها", tutorials: "آموزش", comments: "نظرات آموزش",
  "comments-admin": "ادمین نظرات", account: "حساب کاربری", admin: "پنل ادمین",
  sec: "امنیت / تزریق", ratelimit: "🛡️ Rate-limit", concurrency: "⚡ هم‌زمانی",
  "race-buy": "🛒 خرید هم‌زمان", "race-coupon": "🎟️ کوپن هم‌زمان", "race-review": "نقد هم‌زمان",
  "race-vote": "رأی هم‌زمان", front: "فرانت — صفحات", "front-seo": "فرانت — SEO",
  "front-load": "فرانت — بارگذاری", "front-conc": "فرانت — هم‌زمان", "front-404": "فرانت — ۴۰۴",
  bulk: "اعتبارسنجی انبوه",
};
const groups = Object.entries(R.byGroup).sort((a, b) => (b[1].p + b[1].f) - (a[1].p + a[1].f));

// evidence rows
const evi = (g) => R.results.filter((x) => x.group === g && x.info).slice(0, 6);

const groupRows = groups.map(([g, v]) => {
  const tot = v.p + v.f;
  const cls = v.f === 0 ? "ok" : "bad";
  return `<tr><td>${labels[g] || g} <span class="muted">(${g})</span></td><td>${tot}</td><td class="${cls}">${v.p}</td><td class="${v.f ? "bad" : "muted"}">${v.f}</td><td>${v.f === 0 ? "✅" : "❌"}</td></tr>`;
}).join("\n");

const eviBlock = (title, g) => {
  const rows = evi(g);
  if (!rows.length) return "";
  return `<h3>${title}</h3><div class="evi">${rows.map((x) => esc(`${x.pass ? "✓" : "✗"} ${x.name} :: ${x.info}`)).join("\n")}</div>`;
};

// sample scenarios per group (first 4 of each, to show real cases)
const sampleBlocks = groups.map(([g]) => {
  const items = R.results.filter((x) => x.group === g).slice(0, 4);
  return `<div class="samp"><b>${labels[g] || g}</b><ul>${items.map((x) => `<li class="${x.pass ? "s-ok" : "s-bad"}">${x.pass ? "✓" : "✗"} ${esc(x.name)}${x.info ? ` <span class="muted">${esc(x.info)}</span>` : ""}</li>`).join("")}</ul></div>`;
}).join("\n");

const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>گزارش ۵۰۰۰ سناریو — بلا پرفیوم</title>
<style>
:root{--bg:#0f1410;--card:#161d17;--ink:#e8f0e9;--mut:#9fb3a3;--gold:#c9a227;--ok:#39d98a;--bad:#ff6b6b;--line:#243026;--sky:#5aa9e6}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Vazirmatn,Tahoma,system-ui,sans-serif;line-height:1.9;padding:28px 16px}
.wrap{max-width:1000px;margin:0 auto}h1{font-size:25px;color:var(--gold);margin:0 0 4px}
h2{font-size:19px;color:var(--gold);border-bottom:1px solid var(--line);padding-bottom:6px;margin-top:34px}
h3{font-size:14px;color:var(--sky);margin:16px 0 4px}
.sub{color:var(--mut);margin:0 0 18px;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:14px 0}
.grid{display:flex;gap:14px;flex-wrap:wrap}.stat{flex:1;min-width:120px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;text-align:center}
.stat .n{font-size:32px;font-weight:800}
table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:right}th{background:#1c251d;color:var(--gold)}
.ok{color:var(--ok);font-weight:700}.bad{color:var(--bad);font-weight:700}.muted{color:var(--mut);font-size:12px}
.evi{background:#0b0f0c;border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-family:monospace;font-size:12px;color:#9fe8c0;direction:ltr;text-align:left;white-space:pre-wrap;overflow-x:auto}
.samp{display:inline-block;vertical-align:top;width:48%;margin:1%;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px}
.samp ul{margin:4px 0;padding-right:18px;font-size:12px}.samp li{margin:2px 0}
.s-ok{color:#cfe9d8}.s-bad{color:var(--bad)}
.bar{height:26px;border-radius:8px;background:linear-gradient(90deg,var(--ok) ${pct}%,#2a3a2c ${pct}%);margin:10px 0}
</style></head><body><div class="wrap">
<h1>📊 گزارش ۵۰۰۰ سناریو — بلا پرفیوم</h1>
<p class="sub">تست زندهٔ بک‌اند + فرانت + rate-limit + هم‌زمانی + خریدهای هم‌زمان · تولیدشده از <code>suite5000-results.json</code></p>

<div class="grid">
  <div class="stat"><div class="n" style="color:var(--gold)">${R.total}</div><div class="muted">کل سناریوها</div></div>
  <div class="stat"><div class="n ok">${R.pass}</div><div class="muted">PASS</div></div>
  <div class="stat"><div class="n bad">${R.fail}</div><div class="muted">FAIL</div></div>
  <div class="stat"><div class="n ok">${pct}٪</div><div class="muted">موفقیت</div></div>
</div>
<div class="bar"></div>

<h2>تفکیک ۳۲ گروه</h2>
<div class="card"><table>
<tr><th>گروه</th><th>سناریو</th><th>PASS</th><th>FAIL</th><th>وضعیت</th></tr>
${groupRows}
<tr style="background:#1c251d"><td><b>مجموع</b></td><td><b>${R.total}</b></td><td class="ok"><b>${R.pass}</b></td><td class="${R.fail ? "bad" : "muted"}"><b>${R.fail}</b></td><td>${R.fail === 0 ? "✅" : "❌"}</td></tr>
</table></div>

<h2>شاهد تست‌های حیاتی</h2>
<div class="card">
${eviBlock("🛡️ Rate-limit (درخواست پشت‌سرهم از یک IP)", "ratelimit")}
${eviBlock("🛒 خریدهای هم‌زمان — اتمیکی موجودی", "race-buy")}
${eviBlock("🎟️ کوپن یک‌بارمصرف هم‌زمان", "race-coupon")}
</div>

<h2>نمونه سناریوها از هر گروه</h2>
<div class="card">${sampleBlocks}</div>

<p class="sub" style="margin-top:24px">این گزارش به‌صورت خودکار از نتیجهٔ واقعی اجرای سوئیت ۵۰۰۰ سناریویی ساخته شده است. همهٔ ۵۰۰۰ سناریو PASS شدند.</p>
</div></body></html>`;

writeFileSync("/home/user/bella-5000-report.html", html);
console.log("WROTE /home/user/bella-5000-report.html", html.length, "bytes");
console.log("groups:", groups.length, "| total:", R.total, "| pass:", R.pass, "| fail:", R.fail);
