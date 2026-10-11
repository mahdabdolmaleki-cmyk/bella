import Redis from "ioredis";

// ---------------------------------------------------------------------------
// لایهٔ Redis اختیاری (v43).
// اگر REDIS_URL یا REDIS_HOST تنظیم باشد، از Redis برای کش پاسخ و rate-limit
// مشترک استفاده می‌شود؛ وگرنه همهٔ توابع به‌صورت no-op بی‌خطر عمل می‌کنند تا
// کد بدون Redis هم دقیقاً مثل قبل کار کند.
//   REDIS_URL=redis://:pass@127.0.0.1:6379   یا   REDIS_HOST/REDIS_PORT/REDIS_PASS
// ---------------------------------------------------------------------------
let client = null;

export function redisEnabled() {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
}

export function getRedis() {
  if (!redisEnabled()) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASS || undefined,
    }, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 3000),
    });
    client.on("error", () => {}); // خطای Redis هرگز سرویس را نمی‌خواباند
  }
  return client;
}

export async function cacheGet(key) {
  const r = getRedis();
  if (!r) return null;
  try {
    const v = await r.get(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlMs) {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), "PX", ttlMs);
  } catch {
    /* ignore */
  }
}

export async function cacheDel(...keys) {
  const r = getRedis();
  if (!r || keys.length === 0) return;
  try {
    await r.del(keys);
  } catch {
    /* ignore */
  }
}

// شمارندهٔ مشترک برای rate-limit در حالت کلاستر.
export async function redisIncr(key, windowMs) {
  const r = getRedis();
  if (!r) return null;
  try {
    const count = await r.incr(key);
    if (count === 1) await r.pexpire(key, windowMs);
    return count;
  } catch {
    return null;
  }
}
