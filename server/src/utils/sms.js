/**
 * SMS sender — sms.ir only (REST API v1 · api.sms.ir).
 *
 * همهٔ پیامک‌ها از طریق «قالب» (template) پنل sms.ir ارسال می‌شوند:
 * متن هر پیامک در پنل sms.ir (بخش ارسال سریع / قالب‌ها) تعریف و تأیید
 * می‌شود و این‌جا فقط شناسهٔ قالب و مقادیر پارامترها ارسال می‌شود.
 *
 * .env سرور:
 *   SMSIR_API_KEY=...   (پنل sms.ir ← بخش برنامه‌نویسان ← کلیدهای API)
 *   SMSIR_LINE=...      (fallback شماره خط؛ قابل‌تنظیم از پنل ادمین)
 *
 * Routes:
 *   POST /v1/send/verify — ارسال با قالب (همهٔ رویدادها)
 *   POST /v1/send/bulk   — ارسال عادی از خط (fallback وقتی قالب کد تأیید تنظیم نشده)
 *   GET  /v1/credit      — مانده اعتبار
 * Response: { status: 1, message: "موفق", data: ... } — status 1 = موفق.
 *
 * In development (or production without a key) the message is printed to the
 * console instead of being sent, so the whole flow stays testable.
 */
import Settings from "../models/Settings.js";

const SMSIR_KEY = process.env.SMSIR_API_KEY || "";
const ENV_SMSIR_LINE = process.env.SMSIR_LINE || "";
const TIMEOUT_MS = 8000;
const SMSIR_BASE = "https://api.sms.ir/v1";

// نام پیش‌فرض پارامتر کد در قالب کد تأیید.
const DEFAULT_OTP_PARAM = "Code";

// اگر قالبی برای کد تأیید تنظیم نشده باشد، کد با این متن ثابت از خط
// اختصاصی ارسال می‌شود تا ورود هرگز از کار نیفتد.
const otpFallbackText = (code, minutes) =>
  `کد تأیید بلا پرفیوم: ${code}\nاین کد تا ${minutes} دقیقه معتبر است. آن را در اختیار کسی قرار ندهید.`;

// آخرین خطای دقیق سرویس پیامک — برای نمایش به ادمین در «ارسال پیامک تست».
let lastSmsError = "";

/** متن آخرین خطای سرویس پیامک (خالی اگر آخرین ارسال موفق بود). */
export function getLastSmsError() {
  return lastSmsError;
}

/** درخواست به sms.ir با هدر X-API-KEY و تایم‌اوت؛ خطاها متن فارسی سرویس را حمل می‌کنند. */
async function smsirRequest(path, body, method = "POST") {
  lastSmsError = "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SMSIR_BASE + path, {
      method,
      headers: {
        "X-API-KEY": SMSIR_KEY,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    const ok = res.ok && data && typeof data === "object" && data.status === 1;
    if (ok) {
      return { ok: true, data: data.data, error: "" };
    }
    const detail =
      (data && typeof data === "object" && data.message) ||
      (raw || "").trim().slice(0, 200) ||
      `پاسخ HTTP ${res.status} از سرویس sms.ir.`;
    lastSmsError = String(detail);
    return { ok: false, data: null, error: String(detail) };
  } catch {
    lastSmsError = "ارتباط با سرویس sms.ir برقرار نشد.";
    return { ok: false, data: null, error: lastSmsError };
  } finally {
    clearTimeout(timer);
  }
}

/** تنظیمات پیامک از پنل ادمین (با جایگزینِ متغیر محیطی برای خط). */
async function loadSmsSettings() {
  try {
    const doc = await Settings.getSingleton();
    return {
      smsirLine: doc?.smsirLine || ENV_SMSIR_LINE,
      smsirTemplateId: doc?.smsirTemplateId || "",
      // پاکسازی مثل نام پارامترهای رویدادها — پنل sms.ir نام‌ها را با # نشان می‌دهد.
      smsirOtpParam: String(doc?.smsirOtpParam || DEFAULT_OTP_PARAM).replace(/[#\s]+/g, "") || DEFAULT_OTP_PARAM,
    };
  } catch {
    return {
      smsirLine: ENV_SMSIR_LINE,
      smsirTemplateId: "",
      smsirOtpParam: DEFAULT_OTP_PARAM,
    };
  }
}

/**
 * وضعیت سرویس: "smsir" وقتی کلید هست؛ در محیط توسعه بدون کلید "console"
 * (پیام فقط در لاگ سرور چاپ می‌شود) و در production بدون کلید "unconfigured".
 */
function providerState() {
  if (SMSIR_KEY) return "smsir";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "console";
}

function consoleLog(phone, text) {
  console.log(`\u2709\ufe0f  [SMS \u2192 ${phone}] ${text}`);
}

function consoleDelivery(phone, text) {
  // Never log real codes in production.
  if (process.env.NODE_ENV !== "production") {
    consoleLog(phone, text);
    return true;
  }
  console.warn("SMS provider is not configured — message not delivered.");
  lastSmsError = "کلید SMSIR_API_KEY در فایل .env سرور تنظیم نشده است.";
  return false;
}

/** ارسال با قالب (متد verify) — parameters به‌صورت [{name, value}]. */
async function sendVerify(templateId, phone, parameters) {
  const r = await smsirRequest("/send/verify", {
    mobile: phone,
    templateId: Number(templateId),
    parameters: parameters.map((p) => ({ name: p.name, value: String(p.value) })),
  });
  if (!r.ok) console.warn(`[SMS:smsir] ${r.error}`);
  return r;
}

/**
 * ارسال عادی از خط اختصاصی (متد bulk) — فقط fallback کد تأیید بدون قالب.
 */
export async function sendSms(phone, text) {
  if (providerState() !== "smsir") return consoleDelivery(phone, text);

  const s = await loadSmsSettings();
  const line = String(s.smsirLine || "").replace(/\D/g, "");
  if (!line) {
    lastSmsError = "شماره خط sms.ir تنظیم نشده؛ در تنظیمات ← پیامک‌ها وارد کنید.";
    console.warn(`[SMS:smsir] ${lastSmsError}`);
    return false;
  }
  const r = await smsirRequest("/send/bulk", {
    lineNumber: Number(line),
    messageText: text,
    mobiles: [phone],
    sendDateTime: null,
  });
  if (!r.ok) console.warn(`[SMS:smsir] ${r.error}`);
  return r.ok;
}

/**
 * ارسال کد یک‌بارمصرف (ورود، تأیید تغییر شماره/ایمیل).
 * اگر «شناسهٔ قالب کد تأیید» تنظیم شده باشد، کد با همان قالب پنل sms.ir
 * می‌رود؛ وگرنه با متن پیش‌فرض ثابت از خط اختصاصی.
 */
export async function sendOtpWithTemplate(phone, code, extraVars = {}) {
  const s = await loadSmsSettings();
  const minutes = extraVars.minutes || 5;
  const templateId = String(s.smsirTemplateId || "").replace(/\D/g, "");

  if (providerState() !== "smsir") {
    return consoleDelivery(
      phone,
      templateId
        ? `قالب ${templateId} — ${s.smsirOtpParam}=${code}`
        : otpFallbackText(code, minutes)
    );
  }
  if (templateId) {
    const r = await sendVerify(templateId, phone, [
      { name: s.smsirOtpParam, value: code },
    ]);
    return r.ok;
  }
  return sendSms(phone, otpFallbackText(code, minutes));
}

// ---------------------------------------------------------------------------
// رویدادهای اطلاع‌رسانی — همه با قالب پنل sms.ir.
// «مقادیر» هر رویداد ترتیب ثابت دارند؛ «نام» پارامترها را ادمین در تنظیمات
// وارد می‌کند تا دقیقاً با نام‌های تعریف‌شده در قالب پنل sms.ir یکی باشد
// (sms.ir تطابق دقیق نام‌ها را اجباری می‌کند).
// ---------------------------------------------------------------------------
const EVENTS = {
  orderPlaced: {
    enabledKey: "smsOrderPlacedEnabled",
    templateKey: "smsirOrderPlacedTemplate",
    paramsKey: "smsirOrderPlacedParams",
    defaultNames: ["ORDERID", "NAME", "TOTAL"],
    values: (v) => [v.orderId, v.name, v.total],
  },
  orderPlacedAdmin: {
    enabledKey: "smsAdminNotifyEnabled",
    templateKey: "smsirAdminOrderTemplate",
    paramsKey: "smsirAdminOrderParams",
    defaultNames: ["ORDERID", "NAME", "TOTAL", "PHONE"],
    admin: true,
    values: (v) => [v.orderId, v.name, v.total, v.phone],
  },
  orderStatus: {
    enabledKey: "smsOrderStatusEnabled",
    templateKey: "smsirOrderStatusTemplate",
    paramsKey: "smsirOrderStatusParams",
    defaultNames: ["ORDERID", "STATUS"],
    values: (v) => [v.orderId, v.status],
  },
  abandonedFirst: {
    enabledKey: "smsAbandonedFirstEnabled",
    templateKey: "smsirAbandonedFirstTemplate",
    paramsKey: "smsirAbandonedFirstParams",
    defaultNames: ["NAME", "TOTAL"],
    values: (v) => [v.name, v.total],
  },
  abandonedSecond: {
    enabledKey: "smsAbandonedSecondEnabled",
    templateKey: "smsirAbandonedSecondTemplate",
    paramsKey: "smsirAbandonedSecondParams",
    defaultNames: ["NAME", "TOTAL"],
    values: (v) => [v.name, v.total],
  },
  cancelAdmin: {
    enabledKey: "smsCancelAdminEnabled",
    templateKey: "smsirCancelAdminTemplate",
    paramsKey: "smsirCancelAdminParams",
    defaultNames: ["ORDERID", "NAME", "TOTAL", "PHONE"],
    admin: true,
    values: (v) => [v.orderId, v.name, v.total, v.phone],
  },
};

/**
 * رشتهٔ «A, B, C» ادمین را به فهرست نام‌های تمیز تبدیل می‌کند:
 * حذف #، فاصله‌های اضافی و موارد خالی؛ خالی/نامعتبر = نام‌های پیش‌فرض.
 */
function parseParamNames(raw, defaults) {
  const names = String(raw || "")
    .split(",")
    .map((n) => n.replace(/[#\s]+/g, ""))
    .filter(Boolean);
  return names.length ? names : defaults;
}

/**
 * ارسال پیامکِ یک رویداد با قالب به شمارهٔ داده‌شده — بدون بررسی کلید
 * روشن/خاموش (کلید در notifySms و مسیر تست بررسی می‌شود).
 * @returns {Promise<{ok: boolean, preview?: string, error?: string}>}
 */
export async function sendEventSms(activity, phone, vars = {}) {
  const conf = EVENTS[activity];
  if (!conf) return { ok: false, error: "نوع پیامک نامعتبر است." };

  const doc = await Settings.getSingleton().catch(() => null);
  const templateId = String(doc?.[conf.templateKey] || "").replace(/\D/g, "");
  const names = parseParamNames(doc?.[conf.paramsKey], conf.defaultNames);
  const values = conf.values(vars);
  // تعداد نام و مقدار به حداقلِ مشترک محدود می‌شود؛ مقدار نامشخص = رشتهٔ خالی.
  const params = names.slice(0, values.length).map((name, i) => ({
    name,
    value: values[i] === undefined || values[i] === null ? "" : String(values[i]),
  }));
  const preview = params.map((p) => `${p.name}=${p.value}`).join("، ");

  if (!templateId) {
    lastSmsError = "شناسهٔ قالب این پیامک در تنظیمات ← پیامک‌ها وارد نشده است.";
    console.warn(`[SMS:smsir] ${activity}: ${lastSmsError}`);
    return { ok: false, error: lastSmsError, preview };
  }
  if (providerState() !== "smsir") {
    consoleLog(phone, `قالب ${templateId} — ${preview}`);
    return { ok: true, preview };
  }
  const r = await sendVerify(templateId, phone, params);
  if (!r.ok && /پارامتر|مقداردهی/i.test(r.error || "")) {
    return {
      ok: false,
      preview,
      error: `${r.error} — راهنما: نام‌های فیلد «نام پارامترهای قالب» باید دقیقاً با نام‌های تعریف‌شده در قالب پنل sms.ir یکی باشند (تعداد و املای هر دو طرف).`,
    };
  }
  return r.ok ? { ok: true, preview } : { ok: false, error: r.error, preview };
}

/**
 * پیامک اطلاع‌رسانی رویدادها (ثبت سفارش، تغییر وضعیت، اطلاع مدیر).
 * هرگز خطا نمی‌دهد تا مسیر اصلی — مثلاً ثبت سفارش — شکسته نشود.
 * @returns {Promise<boolean>}
 */
export async function notifySms(activity, phone, vars = {}) {
  try {
    const conf = EVENTS[activity];
    if (!conf) return false;
    const doc = await Settings.getSingleton();
    if (doc?.[conf.enabledKey] !== "1") return false;
    const target = conf.admin ? doc?.smsAdminPhone || "" : phone;
    if (!target) return false;
    const r = await sendEventSms(activity, target, vars);
    return r.ok;
  } catch {
    return false;
  }
}

/** ماندهٔ اعتبار sms.ir — برای دکمهٔ «بررسی اعتبار» پنل. */
export async function getSmsCredit() {
  if (providerState() !== "smsir") {
    return {
      ok: false,
      error: "کلید SMSIR_API_KEY در فایل .env سرور تنظیم نشده است.",
    };
  }
  const r = await smsirRequest("/credit", null, "GET");
  if (!r.ok) return { ok: false, error: r.error || "دریافت اعتبار ناموفق بود." };
  return { ok: true, credit: Number(r.data) || 0, unit: "credit" };
}
