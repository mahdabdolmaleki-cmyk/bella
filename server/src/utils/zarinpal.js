/**
 * ZarinPal payment gateway (REST v4).
 *
 * Env:
 *   ZARINPAL_MERCHANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   ZARINPAL_SANDBOX=true|false
 *   ZARINPAL_CURRENCY=IRR (rial, default) | IRT (toman)
 *   PUBLIC_BASE_URL=https://your-site.ir   (used to build the callback URL)
 *
 * SECURITY: the browser callback is NEVER trusted. A payment is only accepted
 * after the server-to-server `verify` call returns code 100 (or 101 = already
 * verified), which is what makes the flow idempotent.
 */
const SANDBOX = String(process.env.ZARINPAL_SANDBOX || "").toLowerCase() === "true";
const BASE = SANDBOX
  ? "https://sandbox.zarinpal.com/pg"
  : "https://payment.zarinpal.com/pg";
// فاصله/کوتیشن اضافه‌ای که هنگام کپی در .env می‌آید، مرچنت را نامعتبر نکند.
const MERCHANT_ID = String(process.env.ZARINPAL_MERCHANT_ID || "")
  .trim()
  .replace(/^["']|["']$/g, "");
// طبق مستندات زرین‌پال، مبلغ متد verify «به ریال» است. برای اینکه request و
// verify هر دو دقیقاً با یک واحد و مطابق مستندات باشند، پیش‌فرض ریال است
// (قیمت‌های سایت تومان‌اند و خودکار ×۱۰ می‌شوند؛ مشتری همان مبلغ را می‌بیند).
const CURRENCY =
  String(process.env.ZARINPAL_CURRENCY || "IRR").trim().toUpperCase() === "IRT" ? "IRT" : "IRR";

/** سقف مبلغ هر تراکنش زرین‌پال: ۱۰۰ میلیون تومان (خطای -41). */
export const ZARINPAL_MAX_TOMAN = 100_000_000;

/** شرح فارسی کدهای خطای زرین‌پال (docs/paymentGateway/errorList) — برای لاگ. */
const ERROR_TEXT = {
  "-9": "خطای اعتبارسنجی (مرچنت/callback/توضیحات/مبلغ)",
  "-10": "IP یا مرچنت کد پذیرنده صحیح نیست",
  "-11": "مرچنت کد فعال نیست",
  "-12": "تلاش بیش از حد مجاز",
  "-13": "محدودیت تراکنش — تکمیل مدارک",
  "-14": "دامنهٔ callback با دامنهٔ ثبت‌شدهٔ درگاه مغایرت دارد",
  "-15": "درگاه تعلیق شده",
  "-16": "سطح پذیرنده پایین‌تر از نقره‌ای",
  "-17": "محدودیت پذیرنده در سطح آبی",
  "-18": "استفاده از درگاه روی دامنهٔ دیگر",
  "-19": "ایجاد تراکنش برای این ترمینال ممنوع است",
  "-41": "حداکثر مبلغ ۱۰۰ میلیون تومان",
  "-50": "مبلغ verify با مبلغ پرداخت‌شده متفاوت است",
  "-51": "پرداخت ناموفق",
  "-52": "خطای غیرمنتظره — پشتیبانی زرین‌پال",
  "-53": "پرداخت متعلق به این مرچنت نیست",
  "-54": "اتوریتی نامعتبر",
  "-55": "تراکنش یافت نشد",
};
export function zarinpalErrorText(code) {
  if (code === null || code === undefined) return "عدم ارتباط با زرین‌پال";
  return ERROR_TEXT[String(code)] || `کد ${code}`;
}
const TIMEOUT_MS = 15000;

export function isZarinpalConfigured() {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    MERCHANT_ID
  );
}

/** وضعیت درگاه برای لاگ راه‌اندازی — مرچنت کامل هرگز چاپ نمی‌شود. */
export function zarinpalMode() {
  return {
    configured: isZarinpalConfigured(),
    sandbox: SANDBOX,
    currency: CURRENCY,
    merchantHint: MERCHANT_ID ? `${MERCHANT_ID.slice(0, 4)}…${MERCHANT_ID.slice(-4)}` : "",
  };
}

export function startUrl(authority) {
  return `${BASE}/StartPay/${authority}`;
}

async function callApi(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/v4/payment/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ merchant_id: MERCHANT_ID, ...payload }),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return json?.data && Object.keys(json.data).length ? json.data : { errors: json?.errors };
  } catch (err) {
    return { errors: { message: err?.name === "AbortError" ? "timeout" : "network" } };
  } finally {
    clearTimeout(timer);
  }
}

// v38: «خطای انتقال» (timeout/network/بدنهٔ ناخوانا) یعنی وضعیت تراکنش نامعلوم
// است — نه اینکه پرداخت رد شده. کد عددیِ زرین‌پال فقط وقتی معتبر است که درگاه
// واقعاً پاسخ داده باشد؛ طبق مستندات errors می‌تواند آرایه باشد.
function isTransportError(data) {
  if (data?.code !== undefined) return false;
  const errs = data?.errors;
  const first = Array.isArray(errs) ? errs[0] : errs;
  return !(first?.code !== undefined && first?.code !== null);
}

/** Amounts are stored in Toman; ZarinPal wants Rial when CURRENCY = IRR. */
function toGatewayAmount(toman) {
  return CURRENCY === "IRR" ? Math.round(toman) * 10 : Math.round(toman);
}

export async function requestPayment({ amount, description, callbackUrl, mobile, email, orderId, autoVerify = false }) {
  if (!isZarinpalConfigured()) {
    return { ok: false, error: "\u062f\u0631\u06af\u0627\u0647 \u067e\u0631\u062f\u0627\u062e\u062a \u067e\u06cc\u06a9\u0631\u0628\u0646\u062f\u06cc \u0646\u0634\u062f\u0647 \u0627\u0633\u062a." };
  }
  const data = await callApi("request.json", {
    amount: toGatewayAmount(amount),
    currency: CURRENCY,
    description: String(description || "").slice(0, 255),
    callback_url: callbackUrl,
    metadata: {
      // «تنظیمات تراکنش» پنل ادمین همین پرچم را کنترل می‌کند (v37):
      //  - غیرخودکار (پیش‌فرض): ما در callback با verify.json تأیید می‌کنیم و
      //    هر تراکنشِ تأییدنشده پایان‌روز خودکار به خریدار عودت می‌شود.
      //  - خودکار: زرین‌پال خودش تراکنش‌های موفق را پایان‌روز تأیید/برداشت
      //    می‌کند — حتی سفارش‌هایی که در سایت منقضی شده‌اند؛ عودتشان دستی است.
      // در هر دو حالت verifyِ callback همان‌جا انجام می‌شود (کد 101 هم موفق است).
      auto_verify: autoVerify === true,
      ...(mobile ? { mobile } : {}),
      ...(email ? { email } : {}),
      ...(orderId ? { order_id: String(orderId) } : {}),
    },
  });

  if (data?.code === 100 && data?.authority) {
    return { ok: true, authority: data.authority, url: startUrl(data.authority) };
  }
  const transport = isTransportError(data);
  return {
    ok: false,
    transport,
    error: transport
      ? "درگاه پرداخت در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید."
      : "ایجاد تراکنش در درگاه ناموفق بود.",
    code: data?.code ?? (Array.isArray(data?.errors) ? data.errors[0]?.code : data?.errors?.code) ?? null,
  };
}

export async function verifyPayment({ amount, authority }) {
  const data = await callApi("verify.json", {
    amount: toGatewayAmount(amount),
    authority,
  });
  // 100 = verified now, 101 = already verified before (idempotent replay).
  if (data?.code === 100 || data?.code === 101) {
    return {
      ok: true,
      alreadyVerified: data.code === 101,
      refId: String(data.ref_id ?? ""),
      cardPan: String(data.card_pan ?? ""),
    };
  }
  const transport = isTransportError(data);
  return {
    ok: false,
    transport,
    code: data?.code ?? (Array.isArray(data?.errors) ? data.errors[0]?.code : data?.errors?.code) ?? null,
  };
}
