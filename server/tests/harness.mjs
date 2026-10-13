// Bella API — test harness (standard runner, assertions, factories).
// Replaces the old ad-hoc test-*.mjs / *-check.mjs scripts.
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export const BASE = process.env.TEST_BASE || "http://127.0.0.1:4000/api";
export const MONGO = process.env.TEST_MONGO || "mongodb://127.0.0.1:27017/bella_test";
export const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";

const SA_PHONE = "09120000000";
const SA_EMAIL = "admin@test.local";
const SA_SID = crypto.createHash("sha256").update(`${SA_PHONE}\0${SA_EMAIL}`, "utf8").digest("hex");

export const sign = (p) => jwt.sign(p, SECRET, { expiresIn: "7d", issuer: "bella-api", audience: "bella-web" });
export const ADMIN = "bella_admin=" + sign({ superAdmin: true, adminSessionId: SA_SID });
export const rndPhone = () => "09" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
// A fresh client IP per request keeps the in-memory rate limiters (keyed by IP)
// from turning a long suite into false 429 failures.
export const rip = () => `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(path, { method = "GET", body, cookie, headers = {} } = {}) {
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", "X-Forwarded-For": rip(), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let j = null;
    try { j = await res.json(); } catch { /* non-JSON */ }
    return { s: res.status, j };
  } catch (e) {
    return { s: 0, j: null, err: String(e) };
  }
}

// ---- registry ----
const TESTS = [];
let CURRENT_GROUP = "general";
export function group(name) { CURRENT_GROUP = name; }
export function test(name, fn) { TESTS.push({ group: CURRENT_GROUP, name, fn }); }
// Register many parameterised scenarios from a list of [label, fn] pairs.
export function testEach(prefix, cases) { for (const [label, fn] of cases) test(`${prefix}: ${label}`, fn); }

// ---- assertions (throw on failure) ----
export class AssertionError extends Error {}
const fail = (m) => { throw new AssertionError(m); };
export const assert = {
  ok: (c, m = "expected truthy") => { if (!c) fail(m); },
  eq: (a, b, m = "") => { if (a !== b) fail(`${m} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  neq: (a, b, m = "") => { if (a === b) fail(`${m} — expected NOT ${JSON.stringify(b)}`); },
  status: (r, code, m = "") => { if (r.s !== code) fail(`${m} — expected HTTP ${code}, got ${r.s} ${JSON.stringify(r.j)?.slice(0, 120)}`); },
  includes: (hay, needle, m = "") => { if (!String(hay).includes(needle)) fail(`${m} — "${hay}" does not include "${needle}"`); },
  gt: (a, b, m = "") => { if (!(a > b)) fail(`${m} — expected ${a} > ${b}`); },
  gte: (a, b, m = "") => { if (!(a >= b)) fail(`${m} — expected ${a} >= ${b}`); },
};

// ---- db + factories ----
let models = {};
export async function connect() {
  await mongoose.connect(MONGO);
  const [User, Product, Order, Settings, ReferralCode, Review, Category] = await Promise.all([
    import("../src/models/User.js").then((m) => m.default),
    import("../src/models/Product.js").then((m) => m.default),
    import("../src/models/Order.js").then((m) => m.default),
    import("../src/models/Settings.js").then((m) => m.default),
    import("../src/models/ReferralCode.js").then((m) => m.default),
    import("../src/models/Review.js").then((m) => m.default).catch(() => null),
    import("../src/models/Category.js").then((m) => m.default).catch(() => null),
  ]);
  models = { User, Product, Order, Settings, ReferralCode, Review, Category };
  return models;
}
export async function disconnect() { await mongoose.disconnect(); }
export const M = () => models;

export async function mkUser(extra = {}) {
  const phone = extra.phone || rndPhone();
  const u = await models.User.create({ phone, name: "کاربر", tokenVersion: 0, ...extra });
  return { u, phone, cookie: "bella_token=" + sign({ sub: String(u._id), tv: u.tokenVersion ?? 0 }) };
}

let catIdCache;
export async function catId() {
  if (catIdCache) return catIdCache;
  const r = await api("/categories");
  catIdCache = r.j?.categories?.[0]?.id ?? null;
  return catIdCache;
}

let pidSeq = 800000;
export async function mkProduct(over = {}) {
  const c = await catId();
  const body = { active: true, stock: 1000, category: c, name: "محصول تست", nameEn: "test", price: 1000000, ...over };
  const r = await api("/admin/products", { method: "POST", cookie: ADMIN, body });
  return r.j?.product || r.j;
}

export const orderBody = (phone, items, x = {}) => ({
  customerName: "کاربر", phone, email: "t@t.com", province: "تهران", city: "تهران",
  postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲",
  termsAccepted: true, items, shippingMethod: "tipax", ...x,
});

// ---- runner ----
export async function runAll() {
  const results = [];
  let pass = 0, failCount = 0;
  const byGroup = {};
  for (const t of TESTS) {
    let ok = true, info = "";
    try { await t.fn(); } catch (e) { ok = false; info = e instanceof AssertionError ? e.message : (e?.stack || String(e)).split("\n").slice(0, 2).join(" "); }
    results.push({ group: t.group, name: t.name, pass: ok, info });
    if (ok) pass++; else failCount++;
    byGroup[t.group] = byGroup[t.group] || { pass: 0, fail: 0 };
    byGroup[t.group][ok ? "pass" : "fail"]++;
  }
  return { results, pass, failCount, total: TESTS.length, byGroup };
}

export function report({ results, pass, failCount, total, byGroup }) {
  console.log("\n=== Bella test suite ===");
  for (const [g, v] of Object.entries(byGroup)) {
    console.log(`  ${g}: ${v.pass} pass, ${v.fail} fail`);
  }
  console.log(`\nTOTAL: ${total} scenarios — ${pass} PASS, ${failCount} FAIL`);
  if (failCount) {
    console.log("\n--- failures ---");
    for (const r of results.filter((x) => !x.pass)) console.log(`  ❌ [${r.group}] ${r.name} — ${r.info}`);
  }
}
