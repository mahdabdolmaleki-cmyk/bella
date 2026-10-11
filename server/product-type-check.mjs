// تأیید: محصولِ «سایر» (general) و «ادکلن» (perfume) درست ساخته/ویرایش/خوانده می‌شوند.
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
const rid = () => Math.floor(Math.random() * 1e9);

// ۱) ساختِ محصولِ «سایر»
const g = await api("/admin/products", { method: "POST", body: {
  name: "خوشبوکنندهٔ خودرو", nameEn: "Car Freshener", price: 250000, stock: 20,
  productType: "general", brand: "برندX", madeIn: "ایران", sizeMl: 50, active: true,
} });
chk.push(["ساختِ محصولِ سایر → ۲۰۱", g.s === 201]);
chk.push(["productType='general' ذخیره شد", g.j?.product?.productType === "general"]);

// ۲) ساختِ محصولِ «ادکلن» (صریح)
const p = await api("/admin/products", { method: "POST", body: {
  name: "ادکلن تست", nameEn: "Test Perfume", price: 900000, stock: 5,
  productType: "perfume", topNotes: "مرکبات", longevity: "بالا", active: true,
} });
chk.push(["productType='perfume' ذخیره شد", p.j?.product?.productType === "perfume"]);

// ۳) ساختِ محصول بدونِ productType → پیش‌فرض «perfume»
const d = await api("/admin/products", { method: "POST", body: {
  name: "پیش‌فرض", nameEn: "Default", price: 100000, stock: 1, active: true,
} });
chk.push(["پیش‌فرض = 'perfume'", d.j?.product?.productType === "perfume"]);

// ۴) خواندنِ محصولِ «سایر» از API عمومی (toDTO)
const pub = await api("/products/" + g.j.product.id);
chk.push(["API عمومی productType='general' برمی‌گرداند", pub.j?.product?.productType === "general"]);

// ۵) ویرایش: تبدیلِ ادکلن → سایر
const patch = await api("/admin/products/" + p.j.product.id, { method: "PATCH", body: { productType: "general" } });
chk.push(["ویرایش به 'general'", patch.j?.product?.productType === "general"]);

// ۶) مقدارِ نامعتبر → «perfume»
const bad = await api("/admin/products", { method: "POST", body: {
  name: "نامعتبر", nameEn: "Bad", price: 100000, stock: 1, productType: "xxx", active: true,
} });
chk.push(["مقدارِ نامعتبر → 'perfume'", bad.j?.product?.productType === "perfume"]);

console.log("=== نتایج ===");
let allOk = true;
for (const [name, ok] of chk) { allOk = allOk && ok; console.log((ok ? "✅" : "❌") + " " + name); }
console.log(allOk ? "\n🟢 نوعِ محصول درست کار می‌کند." : "\n🔴 مورد/مواردی شکست خورد.");
process.exit(allOk ? 0 : 1);
