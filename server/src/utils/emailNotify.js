/**
 * Email notifications — parallel to SMS.
 * هر پیامکی که برای مشتری یا ادمین فرستاده می‌شود، همزمان ایمیل هم ارسال می‌شود
 * اگر تیک ایمیل آن رویداد در تنظیمات فعال باشد.
 *
 * تنظیمات از Settings.getSingleton() خوانده می‌شود:
 *   emailAdmin — ایمیل مدیر برای اطلاع‌رسانی‌ها
 *   emailOtpEnabled, emailOrderPlacedEnabled, emailAdminNotifyEnabled,
 *   emailOrderStatusEnabled, emailAbandonedFirstEnabled,
 *   emailAbandonedSecondEnabled, emailCancelAdminEnabled
 */

import Settings from "../models/Settings.js";
import { sendMail } from "./mailer.js";

const EMAIL_EVENTS = {
  orderPlaced: {
    enabledKey: "emailOrderPlacedEnabled",
    subject: (v) => `سفارش شما ثبت شد — ${v.orderId || ""}`,
    text: (v) =>
      `سلام ${v.name || "عزیز"}،\n\nسفارش شما با کد پیگیری ${v.orderId} ثبت شد.\nمبلغ: ${v.total} تومان\n\nبه زودی وضعیت سفارش را به شما اطلاع می‌دهیم.\n\nبلا پرفیوم`,
    html: (v) =>
      `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#06120b;color:#f2e9d4;padding:28px;border-radius:16px">
        <p style="color:#d4af37;font-weight:bold;margin:0 0 14px">Bella Perfume</p>
        <h2 style="margin:0 0 12px;color:#f2e9d4">سفارش شما ثبت شد ✓</h2>
        <p style="margin:0 0 8px">سلام ${escapeHtml(v.name || "عزیز")}،</p>
        <p style="margin:0 0 8px">سفارش شما با کد پیگیری <b>${escapeHtml(v.orderId)}</b> ثبت شد.</p>
        <p style="margin:0 0 8px">مبلغ: <b>${escapeHtml(v.total)} تومان</b></p>
        <p style="margin:16px 0 0;font-size:12px;color:#93ac9c">به زودی وضعیت سفارش را به شما اطلاع می‌دهیم.</p>
      </div>`,
  },
  orderPlacedAdmin: {
    enabledKey: "emailAdminNotifyEnabled",
    admin: true,
    subject: (v) => `سفارش جدید — ${v.orderId || ""} — ${v.name || ""}`,
    text: (v) =>
      `سفارش جدید ثبت شد\n\nکد پیگیری: ${v.orderId}\nنام مشتری: ${v.name}\nشماره تماس: ${v.phone}\nمبلغ: ${v.total} تومان\n\nپنل ادمین را بررسی کنید.`,
    html: (v) =>
      `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#0b1a12;color:#f2e9d4;padding:24px;border-radius:14px">
        <h2 style="color:#d4af37;margin:0 0 12px">سفارش جدید 🛒</h2>
        <p>کد پیگیری: <b>${escapeHtml(v.orderId)}</b></p>
        <p>نام مشتری: <b>${escapeHtml(v.name)}</b></p>
        <p>شماره تماس: <b>${escapeHtml(v.phone)}</b></p>
        <p>مبلغ: <b>${escapeHtml(v.total)} تومان</b></p>
      </div>`,
  },
  orderStatus: {
    enabledKey: "emailOrderStatusEnabled",
    subject: (v) => `وضعیت سفارش ${v.orderId} — ${v.status}`,
    text: (v) => `سفارش ${v.orderId} شما به وضعیت «${v.status}» تغییر کرد.\n\nبلا پرفیوم`,
    html: (v) =>
      `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;padding:20px">
        <p>سفارش <b>${escapeHtml(v.orderId)}</b> شما به وضعیت <b>${escapeHtml(v.status)}</b> تغییر کرد.</p>
        <p style="font-size:12px;color:#666">بلا پرفیوم</p>
      </div>`,
  },
  abandonedFirst: {
    enabledKey: "emailAbandonedFirstEnabled",
    subject: () => `سبد خرید شما منتظر شماست 🛍️`,
    text: (v) =>
      `سلام ${v.name || "عزیز"}،\n\nسبد خرید شما به مبلغ ${v.total} تومان هنوز تکمیل نشده.\nبرای تکمیل خرید به سایت برگردید.\n\nبلا پرفیوم`,
    html: (v) =>
      `<div dir="rtl" style="font-family:Tahoma;padding:20px"><p>سلام ${escapeHtml(v.name || "عزیز")}،</p><p>سبد خرید شما به مبلغ <b>${escapeHtml(v.total)} تومان</b> هنوز تکمیل نشده.</p><p><a href="https://bellaperfume.ir/shop" style="color:#d4af37">تکمیل خرید</a></p></div>`,
  },
  abandonedSecond: {
    enabledKey: "emailAbandonedSecondEnabled",
    subject: () => `آخرین فرصت — سبد خرید شما ⏰`,
    text: (v) =>
      `سلام ${v.name || "عزیز"}،\n\nاین آخرین یادآوری برای سبد خرید ${v.total} تومانی شماست.\nموجودی محدود است.\n\nبلا پرفیوم`,
    html: (v) =>
      `<div dir="rtl" style="font-family:Tahoma;padding:20px"><p>سلام ${escapeHtml(v.name || "عزیز")}،</p><p>این آخرین یادآوری برای سبد خرید <b>${escapeHtml(v.total)} تومانی</b> شماست.</p></div>`,
  },
  cancelAdmin: {
    enabledKey: "emailCancelAdminEnabled",
    admin: true,
    subject: (v) => `درخواست لغو سفارش — ${v.orderId}`,
    text: (v) =>
      `🚨 درخواست لغو سفارش\n\nکد پیگیری: ${v.orderId}\nنام مشتری: ${v.name}\nشماره تماس: ${v.phone}\nمبلغ سفارش: ${v.total} تومان\nوضعیت فعلی: ${v.status || ""}\nزمان: ${v.time || ""}\n\nلطفا پنل ادمین را بررسی کنید.`,
    html: (v) =>
      `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#1a0b0b;color:#f2e9d4;padding:24px;border-radius:14px;border:1px solid #ff4444">
        <h2 style="color:#ff6b6b;margin:0 0 12px">🚨 درخواست لغو سفارش</h2>
        <p>کد پیگیری: <b>${escapeHtml(v.orderId)}</b></p>
        <p>نام مشتری: <b>${escapeHtml(v.name)}</b></p>
        <p>شماره تماس: <b>${escapeHtml(v.phone)}</b></p>
        <p>مبلغ سفارش: <b>${escapeHtml(v.total)} تومان</b></p>
        <p>وضعیت فعلی: ${escapeHtml(v.status || "")}</p>
        <p>زمان: ${escapeHtml(v.time || "")}</p>
      </div>`,
  },
};

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * ارسال ایمیل رویداد
 * @returns {Promise<boolean>}
 */
export async function notifyEmail(activity, toEmail, vars = {}) {
  try {
    const conf = EMAIL_EVENTS[activity];
    if (!conf) return false;
    const doc = await Settings.getSingleton();
    if (doc?.[conf.enabledKey] !== "1") return false;

    let target = toEmail;
    if (conf.admin) {
      target = doc?.emailAdmin || doc?.contactEmail || "";
    }
    if (!target) return false;

    const subject = conf.subject(vars);
    const text = conf.text(vars);
    const html = conf.html(vars);

    const ok = await sendMail(target, subject, text, html);
    return ok;
  } catch (e) {
    console.warn(`[Email:${activity}] failed`, e?.message || e);
    return false;
  }
}

/**
 * برای تست از پنل ادمین
 */
export async function sendTestEmail(activity, toEmail) {
  const samples = {
    orderPlaced: { name: "مشتری نمونه", orderId: "BL-TEST12", total: "6,490,000" },
    orderPlacedAdmin: { name: "مشتری نمونه", orderId: "BL-TEST12", total: "6,490,000", phone: "09120000000" },
    orderStatus: { orderId: "BL-TEST12", status: "ارسال شد" },
    abandonedFirst: { name: "مشتری نمونه", total: "6,490,000" },
    abandonedSecond: { name: "مشتری نمونه", total: "6,490,000" },
    cancelAdmin: { orderId: "BL-TEST12", name: "مشتری نمونه", phone: "09120000000", total: "6,490,000", status: "در حال پردازش", time: new Date().toLocaleString("fa-IR") },
  };
  const vars = samples[activity];
  if (!vars) return { ok: false, error: "نوع ایمیل نامعتبر است." };
  const conf = EMAIL_EVENTS[activity];
  if (!conf) return { ok: false, error: "رویداد نامعتبر" };
  const subject = conf.subject(vars);
  const text = conf.text(vars);
  const html = conf.html(vars);
  const { sendMailDetailed } = await import("./mailer.js");
  const result = await sendMailDetailed(toEmail, subject, text, html);
  return result;
}
