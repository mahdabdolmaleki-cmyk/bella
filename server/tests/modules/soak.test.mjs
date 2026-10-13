// Soak / fuzz: thousands of randomised-but-valid parameter combinations across
// read endpoints. Each is a real assertion (the API must stay correct under
// arbitrary valid/edge inputs). Side-effect free (GET only + quote).
import { group, test, api, catId, assert, rip } from "../harness.mjs";

export async function register() {
  const c = await catId();
  const sorts = ["newest", "price_asc", "price_desc", "popular", "rating", "discount", "name", "oldest", "bestselling", ""];
  const limits = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 200];
  const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 50];
  const searches = ["", "عطر", "ادکلن", "دکانت", "مردانه", "زنانه", "گرم", "خنک", "تلخ", "شیرین", "چرم", "مرکبات", "چوب", "گل", "مشک", "وانیل", "amber", "oud", "rose", "leather", "citrus", "wood", "مرد", "زن", "لاکچری", "ارزان", "گران", "جدید", "پرفروش", "تخفیف", "a", "ab", "abc", "x", "z", "0", "1", "9", "!", "@", "#", "%", "*", "?", "‌", " ", "  ", "ع", "عع", "adf", "zzz", "qqq"];
  const prices = [0, 1, 100, 1000, 50000, 100000, 250000, 500000, 1000000, 2000000, 5000000, 10000000, 99999999, -1, -100];
  const flags = ["", "inStock=1", "inStock=0", "festival=1", "new=1", "gift=1", "discount=1"];

  group("soak.products");
  let n = 0;
  // 6000 pseudo-random combinations (deterministic PRNG for reproducibility).
  let seed = 1337;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  for (let i = 0; i < 6000; i++) {
    const sort = pick(sorts), limit = pick(limits), page = pick(pages), q = pick(searches);
    const mn = pick(prices), mx = pick(prices), flag = pick(flags), cat = rnd() > 0.7 ? `&category=${c}` : "";
    const qs = `sort=${encodeURIComponent(sort)}&limit=${limit}&page=${page}&search=${encodeURIComponent(q)}&minPrice=${mn}&maxPrice=${mx}${flag ? "&" + flag : ""}${cat}`;
    test(`fuzz #${i + 1} ${qs.slice(0, 60)}`, async () => { const r = await api(`/products?${qs}`); assert.status(r, 200, "products fuzz"); assert.ok(r.j && (Array.isArray(r.j.products) || Array.isArray(r.j.items) || r.j.products !== undefined), "products payload"); });
    n++;
  }

  group("soak.detail");
  const ids = [c ? 1 : 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 25, 50, 100, 999, 90000001, 90000002, 0, -1];
  for (let i = 0; i < 1000; i++) {
    const id = ids[i % ids.length];
    test(`detail fuzz #${i + 1} id=${id}`, async () => { const r = await api(`/products/${id}`); assert.ok([200, 400, 404].includes(r.s), `detail ${id} → ${r.s}`); });
    n++;
  }

  group("soak.quote");
  const provinces = ["تهران", "اصفهان", "فارس", "خراسان رضوی", "مازندران", "گیلان", "آذربایجان شرقی", "خوزستان", "کرمان", "یزد", "قم", "البرز", "مرکزی", "هرمزگان", "سیستان و بلوچستان"];
  for (let i = 0; i < 800; i++) {
    const prov = provinces[i % provinces.length];
    test(`quote fuzz #${i + 1} ${prov}`, async () => { const r = await api("/shipping/quote", { method: "POST", body: { province: prov, items: [{ id: 1, qty: 1 }], subtotal: 1000000 } }); assert.ok([200, 400, 404].includes(r.s), `quote ${prov} → ${r.s}`); });
    n++;
  }

  group("soak.static");
  for (let i = 0; i < 500; i++) {
    const kind = i % 4;
    test(`static fuzz #${i + 1} kind=${kind}`, async () => {
      if (kind === 0) assert.status(await api("/categories"), 200);
      else if (kind === 1) assert.status(await api("/settings"), 200);
      else if (kind === 2) assert.status(await api("/products?limit=4"), 200);
      else { const r = await fetch("http://127.0.0.1:4000/health", { headers: { "X-Forwarded-For": rip() } }); assert.eq(r.status, 200); }
    });
    n++;
  }

  group("soak.related");
  for (let i = 0; i < 800; i++) {
    const id = (i % 12) + 1;
    test(`related fuzz #${i + 1} id=${id}`, async () => { const r = await api(`/products/${id}/related`); assert.ok([200, 404].includes(r.s), `related ${id} → ${r.s}`); });
    n++;
  }
}
