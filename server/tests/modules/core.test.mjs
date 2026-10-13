// Core HTTP coverage: auth, catalog, validation, security. No persistent side effects.
import { group, test, testEach, api, ADMIN, mkUser, rndPhone, rip, assert, catId } from "../harness.mjs";

export async function register() {
  const c = await catId();

  // ---------------- AUTH ----------------
  group("auth");
  const badPhones = ["", "123", "0912", "912000000", "09", "093", "0939", "09391", "093912", "0939123", "09391234", "093912345", "091200000000000", "99999999999", "11111111111", "22222222222", "55555555555", "0", "00", "abcdefg", "phone", "null", "undefined", "  "];
  testEach("otp phone", badPhones.map((p) => [`«${p}»`, async () => { const r = await api("/otp/request", { method: "POST", body: { phone: p, channel: "sms" } }); assert.ok([400, 429].includes(r.s), `expected 400/429 got ${r.s}`); }]));

  const badEmails = ["", "abc", "abc@", "@x.com", "a@b", "a b@c.com", "a@@b.com", "a@b..com", "a@.com", "a@b.c", ".a@b.com", "a.@b.com", "a@b@c.com", "a b@c.com", "a@b com", "a@b,c.com", "a@b;com", "a@b:com", "plainaddress", "#@%^%#$@#$@#.com", "@example.com", "Joe Smith <email@example.com>", "email.example.com", "email@example@example.com", ".email@example.com", "email.@example.com", "email..email@example.com", "email@example.com (Joe Smith)", "email@example", "email@111.222.333.44444", "email@example..com", "Abc..123@example.com", "()[]\\;:,<>@example.com", "this is not an email", "email@exam_ple.com", "email@-example.com", "email@example-.com", "email@exam%ple.com", "email@exam#ple.com", "email@exam'ple.com", "email@exam!ple.com", "email@exam$ple.com", "email@exam&ple.com", "email@exam*ple.com", "email@exam+ple.com", "email@exam=ple.com", "email@exam?ple.com", "email@exam/ple.com"];
  testEach("otp email", badEmails.map((e) => [`«${e}»`, async () => { const r = await api("/otp/request", { method: "POST", body: { email: e, channel: "email" } }); assert.eq(r.s, 400, "bad email should 400"); }]));

  for (let i = 0; i < 10; i++) test(`OTP full cycle + login #${i + 1}`, async () => {
    const phone = rndPhone();
    const d = (await api("/otp/request", { method: "POST", body: { phone, channel: "sms" } })).j?.devCode;
    const t = (await api("/otp/verify", { method: "POST", body: { phone, code: d } })).j?.ticket;
    assert.status(await api("/auth/login", { method: "POST", body: { phone, ticket: t } }), 200, "login");
  });
  for (let i = 0; i < 12; i++) test(`OTP wrong code #${i + 1} → 4xx`, async () => { assert.gte((await api("/otp/verify", { method: "POST", body: { phone: rndPhone(), code: String(100000 + i) } })).s, 400); });
  for (let i = 0; i < 12; i++) test(`/auth/me valid cookie #${i + 1}`, async () => assert.status(await api("/auth/me", { cookie: (await mkUser()).cookie }), 200));
  for (let i = 0; i < 12; i++) test(`/auth/me garbage token #${i + 1} → 401`, async () => assert.status(await api("/auth/me", { cookie: "bella_token=garbage" + i }), 401));
  for (let i = 0; i < 10; i++) test(`/auth/me no token #${i + 1} → 401`, async () => assert.status(await api("/auth/me"), 401));
  test("logout returns ok", async () => assert.ok((await api("/auth/logout", { method: "POST", cookie: (await mkUser()).cookie })).j?.ok));

  // ---------------- CATALOG ----------------
  group("catalog");
  const sorts = ["newest", "price_asc", "price_desc", "popular", "rating", "discount", "name"];
  const limits = [1, 4, 12, 24, 48, 96];
  const pages = [1, 2, 3, 5, 8];
  for (const s of sorts) for (const l of limits) for (const p of pages) test(`products sort=${s} limit=${l} page=${p}`, async () => assert.status(await api(`/products?sort=${encodeURIComponent(s)}&limit=${l}&page=${p}`), 200));
  const searches = ["", "عطر", "ادکلن", "دکانت", "مردانه", "زنانه", "گرم", "خنک", "تلخ", "شیرین", "چرم", "مرکبات", "چوب", "گل", "مشک", "وانیل", "amber", "oud", "rose", "xyzzy-not-found"];
  for (const q of searches) test(`search «${q}»`, async () => assert.status(await api(`/products?search=${encodeURIComponent(q)}`), 200));
  const priceMins = [0, 100000, 500000, 1000000, 5000000, -100, 99999999];
  const priceMaxs = [0, 1000000, 5000000, 99999999, -1];
  for (const mn of priceMins) for (const mx of priceMaxs) test(`price min=${mn} max=${mx}`, async () => assert.status(await api(`/products?minPrice=${mn}&maxPrice=${mx}`), 200));
  const filters = ["inStock=1", "inStock=0", `category=${c}`, "festival=1", "new=1", "gift=1", "inStock=1&sort=price_asc", `category=${c}&sort=newest`, "inStock=1&minPrice=100000", "sort=popular&limit=12"];
  for (const f of filters) test(`filter ${f}`, async () => assert.status(await api(`/products?${f}`), 200));
  const badIds = ["abc", "0", "-1", "1.5", "99999999999999999999", "null", "undefined", "%20", "1e3", "0x10", " 1", "1 ", "۱", "١", "1_000", "+1", "1,000", "NaN", "Infinity", "true", "false", "[]", "{}", "1;drop", "'1'", '"1"', "1 OR 1", "1/**/", "1%00", "1..0"];
  for (const id of badIds) test(`bad product id «${id}»`, async () => assert.ok([400, 404].includes((await api(`/products/${encodeURIComponent(id)}`)).s), `expected 400/404`));
  for (let i = 0; i < 15; i++) test(`missing product id ${90000000 + i} → 404`, async () => assert.status(await api(`/products/${90000000 + i}`), 404));
  test("gifts pool endpoint returns array", async () => { const r = await api("/products/gifts"); assert.status(r, 200); assert.ok(Array.isArray(r.j?.gifts), "gifts array"); });
  for (let i = 0; i < 15; i++) test(`categories #${i + 1}`, async () => assert.status(await api("/categories"), 200));
  for (let i = 0; i < 15; i++) test(`settings #${i + 1}`, async () => assert.status(await api("/settings"), 200));
  for (let i = 0; i < 12; i++) test(`/health #${i + 1}`, async () => { const r = await fetch("http://127.0.0.1:4000/health"); assert.eq(r.status, 200); });
  for (let i = 0; i < 12; i++) test(`unknown route /nope-${i} → 404`, async () => assert.status(await api(`/nope-${i}-${Date.now()}`), 404));

  // ---------------- VALIDATION (profile update rejects bad input) ----------------
  group("validation");
  const vu = (await mkUser()).cookie;
  const badPostal = ["1", "12", "123", "1234", "12345", "123456", "1234567", "123456789", "12345678901", "abc1234567", "12345678ab", "12345 6789", "12345-6789", "123456789 ", "0000000000", "9999999999", "1111111111", "abcdefghij", "!@#$%^&*()", "1234567890x", "x123456789", "12345678901234", "۱۲۳۴۵۶۷۸۹"];
  testEach("postalCode", badPostal.map((pc) => [`«${pc}» → 400`, async () => { const r = await api("/auth/me", { method: "PATCH", cookie: vu, body: { postalCode: pc } }); assert.eq(r.s, 400, `postal «${pc}» should 400, got ${r.s}`); }]));
  const badEmailsPatch = ["abc", "abc@", "@x.com", "a@b", "a b@c.com", "a@@b.com", "a@b..com", "a@.com", "a@b.c", "plainaddress", "a@b com", "email@example..com", "a@-b.com", "a@b-.com", "a@b% c.com", "a@b,c.com", "a@b;c.com", "a@b:c.com", "a@b<c.com", "a@b>c.com", "a@b[c.com", "a@b]c.com", "a@b\\c.com", "a@b/c.com", "a@b?c.com", "a@b=c.com", "a@b&c.com", "a@b'c.com", "a@b!c.com", "a@b~c.com"];
  testEach("email patch", badEmailsPatch.map((e) => [`«${e}» → rejected`, async () => { const r = await api("/auth/me", { method: "PATCH", cookie: vu, body: { email: e } }); assert.gte(r.s, 400, `email «${e}» should be rejected, got ${r.s}`); }]));
  const badPhonesPatch = ["123", "0912", "912000000", "0912000000a", "abcdefg", "0912-000-0000", "091200000000000", "11111111111", "0912 000 0000", "phone", "09", "093", "0939", "09391", "093912", "0939123", "09391234", "093912345", "55555555555", "09120000000abc", "abc09120000000", "+989120000000", "00989120000000", "0912.000.0000", "(0912)0000000", "0912000000٠", "۰۹۱۲۰۰۰۰۰۰۰", "09120000000 ", " 09120000000", "09120000000\n"];
  testEach("phone patch", badPhonesPatch.map((p) => [`«${p}» → rejected`, async () => { const r = await api("/auth/me", { method: "PATCH", cookie: vu, body: { phone: p } }); assert.gte(r.s, 400, `phone «${p}» should be rejected, got ${r.s}`); }]));
  const badProvinces = ["ناشناس", "تهرانن", "x", "123", "!@#", "Tehran", "tehran", " Tehran", "اصفها", "مازندرا", "گیلا", "کرما", "یز", "alborz", "markazi", "qom", "yazd", "kerman", "gilan", "mazandaran", "isfahan", "fars", "khuzestan", "razavi", "alborzz", "هرمزگا", "سیستان"];
  testEach("province patch", badProvinces.map((p) => [`«${p}» → 400`, async () => { const r = await api("/auth/me", { method: "PATCH", cookie: vu, body: { province: p } }); assert.eq(r.s, 400, `province «${p}» should 400`); }]));
  test("empty address clears (200)", async () => assert.status(await api("/auth/me", { method: "PATCH", cookie: vu, body: { address: "" } }), 200));
  test("over-long address rejected (400)", async () => assert.eq((await api("/auth/me", { method: "PATCH", cookie: vu, body: { address: "x".repeat(600) } })).s, 400));
  test("empty name → 400", async () => assert.eq((await api("/auth/me", { method: "PATCH", cookie: vu, body: { name: "   " } })).s, 400));
  test("valid profile update → 200", async () => assert.status(await api("/auth/me", { method: "PATCH", cookie: vu, body: { name: "نام درست", province: "تهران", city: "تهران", postalCode: "1234567890", address: "خیابان ولیعصر، کوچهٔ گل، پلاک ۱، واحد ۲" } }), 200));

  // ---------------- SECURITY ----------------
  group("security");
  const protectedGet = ["/auth/me", "/account/loyalty", "/account/coupons", "/account/favorites", "/account/orders", "/account/profile"];
  for (const p of protectedGet) for (let i = 0; i < 6; i++) test(`${p} no auth #${i + 1} → 401`, async () => assert.status(await api(p), 401));
  const adminGet = ["/admin/products", "/admin/orders", "/admin/settings", "/admin/users", "/admin/reviews", "/admin/tutorials", "/admin/logs", "/admin/consultations"];
  for (const p of adminGet) for (let i = 0; i < 6; i++) test(`${p} no auth #${i + 1} → 401`, async () => assert.status(await api(p), 401));
  for (const p of adminGet) for (let i = 0; i < 6; i++) test(`${p} user token #${i + 1} → 401`, async () => assert.status(await api(p, { cookie: (await mkUser()).cookie }), 401));
  for (const p of adminGet) test(`${p} admin token → 2xx`, async () => { const r = await api(p, { cookie: ADMIN }); assert.ok(r.s >= 200 && r.s < 300, `admin should access ${p}, got ${r.s}`); });
  for (let i = 0; i < 8; i++) test(`admin POST products no auth #${i + 1} → 401`, async () => assert.status(await api("/admin/products", { method: "POST", body: { name: "x" } }), 401));
}
