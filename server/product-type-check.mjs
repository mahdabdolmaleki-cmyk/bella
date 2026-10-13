// تأیید: محصولِ «سایر» (general) با زیرنوع (subType) و «ادکلن» (perfume) درست ساخته/ویرایش/خوانده می‌شوند.
import crypto from "crypto";
import jwt from "jsonwebtoken";

const BASE = "http://127.0.0.1:4000/api";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
const SA_PHONE = "09120000000", SA_EMAIL = "admin@test.local";
const SA_SID = crypto.createHash("sha256").update(`${SA_PHONE}\0${SA_EMAIL}`, "utf8").digest("hex");
const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });
const ADMIN = "bella_admin=" + sign({ superAdmin: true, adminSessionId: SA_SID });

async function api(p, opt = {}) {
  const r = await fetch(BASE + p, { method: opt.method || "GET", headers: { "Content-Type": "application/json", Cookie: ADMIN }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}

const chk = [];

// ۱) ساختِ محصولِ «سایر» با زیرنوع
const g = await api("/admin/products", { method: "POST", body: {
  name: "خوشبوکنندهٔ خودرو", nameEn: "Car Freshener", price: 250000, stock: 20, active: true,
  productType: "general", subType: "خوشبوکنندهٔ خودرو", brand: "برندX", madeIn: "ایران", sizeMl: 50,
} });
chk.push(["ساختِ محصولِ سایر → ۲۰۱", g.s === 201]);
chk.push(["productType='general' ذخیره شد", g.j?.product?.productType === "general"]);
chk.push(["subType='خوشبوکنندهٔ خودرو' ذخیره شد", g.j?.product?.subType === "خوشبوکنندهٔ خودرو"]);

// ۲) ساختِ محصولِ «ادکلن» — subType باید خالی بماند
const p = await api("/admin/products", { method: "POST", body: {
  name: "ادکلن تست", nameEn: "Test Perfume", price: 900000, stock: 5, active: true,
  productType: "perfume", topNotes: "مرکبات", longevity: "بالا",
} });
chk.push(["productType='perfume' ذخیره شد", p.j?.product?.productType === "perfume"]);
chk.push(["subType در ادکلن خالی است", p.j?.product?.subType === ""]);

// ۳) پیش‌فرض: بدونِ productType → «perfume»
const d = await api("/admin/products", { method: "POST", body: {
  name: "پیش‌فرض", nameEn: "Default", price: 100000, stock: 1, active: true,
} });
chk.push(["پیش‌فرض = 'perfume'", d.j?.product?.productType === "perfume"]);

// ۴) خواندنِ محصولِ «سایر» از API عمومی (toDTO) — productType + subType
const pub = await api("/products/" + g.j.product.id);
chk.push(["API عمومی productType='general'", pub.j?.product?.productType === "general"]);
chk.push(["API عمومی subType را برمی‌گرداند", pub.j?.product?.subType === "خوشبوکنندهٔ خودرو"]);

// ۵) ویرایش: تغییرِ زیرنوع
const patch = await api("/admin/products/" + g.j.product.id, { method: "PATCH", body: { subType: "اسپری" } });
chk.push(["ویرایشِ subType → 'اسپری'", patch.j?.product?.subType === "اسپری"]);

// ۶) ویرایش: تبدیلِ ادکلن → سایر + زیرنوع
const patch2 = await api("/admin/products/" + p.j.product.id, { method: "PATCH", body: { productType: "general", subType: "بادی‌اسپلش" } });
chk.push(["ویرایشِ ادکلن→سایر + subType", patch2.j?.product?.productType === "general" && patch2.j?.product?.subType === "بادی‌اسپلش"]);

// ۷) مقدارِ نامعتبرِ productType → «perfume»
const bad = await api("/admin/products", { method: "POST", body: {
  name: "نامعتبر", nameEn: "Bad", price: 100000, stock: 1, productType: "xxx", active: true,
} });
chk.push(["productType نامعتبر → 'perfume'", bad.j?.product?.productType === "perfume"]);

// ۸) subType خیلی بلند → به ۶۰ نویسه کوتاه می‌شود
const longSub = "الف".repeat(50); // 100 نویسه
const lg = await api("/admin/products", { method: "POST", body: {
  name: "زیرنوعِ بلند", nameEn: "LongSub", price: 100000, stock: 1, productType: "general", subType: longSub, active: true,
} });
chk.push(["subType بلند به ≤۶۰ کوتاه شد", (lg.j?.product?.subType || "").length <= 60]);

console.log("=== نتایج ===");
let allOk = true;
for (const [name, ok] of chk) { allOk = allOk && ok; console.log((ok ? "✅" : "❌") + " " + name); }
console.log(allOk ? "\n🟢 نوعِ محصول + زیرنوع درست کار می‌کند." : "\n🔴 مورد/مواردی شکست خورد.");
process.exit(allOk ? 0 : 1);
