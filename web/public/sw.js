/* Service Worker بلا پرفیوم
 *
 * عمداً محافظه‌کار است: هیچ صفحه، قیمت، موجودی، سبد خرید یا دادهٔ حسابی
 * کش نمی‌شود — همه‌چیز مثل قبل مستقیم از سرور می‌آید. تنها کارش این است که
 * اگر اینترنت کاربر قطع بود، به‌جای صفحهٔ خطای مرورگر، صفحهٔ «اتصال برقرار نیست»
 * خود بلا را نشان بدهد. پنل مدیریت، API و درگاه پرداخت اصلاً لمس نمی‌شوند.
 */
const VERSION = "bella-pwa-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/pwa/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // کش نسخه‌های قدیمی همین SW پاک می‌شود.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      // navigation preload: صفحه بدون منتظر ماندن برای بیدار شدن SW درخواست می‌شود.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return; // فقط باز شدن صفحه‌ها

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API (از جمله برگشت از زرین‌پال) و پنل مدیریت کاملاً دست‌نخورده می‌مانند.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(req);
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })()
  );
});
