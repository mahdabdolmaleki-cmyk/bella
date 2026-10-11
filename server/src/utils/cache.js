import { cacheGet, cacheSet } from "./redis.js";

// ---------------------------------------------------------------------------
// کش پاسخ HTTP برای GETهای عمومی و پرمخاطب (v43).
// اگر Redis فعال باشد، پاسخ ۲۰۰ برای ttlMs میلی‌ثانیه کش می‌شود و درخواست‌های
// بعدی بدون عبور از دیتابیس پاسخ می‌گیرند؛ بدون Redis کاملاً بی‌اثر است.
// با TTL کوتاه، تغییرات ادمین حداکثر پس از چند ثانیه دیده می‌شوند.
// ---------------------------------------------------------------------------
export function cacheResponse(ttlMs, keyFn) {
  return async (req, res, next) => {
    if (req.method !== "GET") return next();
    let key;
    try {
      key = "resp:" + keyFn(req);
    } catch {
      return next();
    }
    const hit = await cacheGet(key);
    if (hit) {
      res.setHeader("X-Cache", "HIT");
      return res.status(hit.status || 200).json(hit.body);
    }
    const origJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        cacheSet(key, { status: 200, body }, ttlMs); // fire-and-forget
      }
      res.setHeader("X-Cache", "MISS");
      return origJson(body);
    };
    next();
  };
}
