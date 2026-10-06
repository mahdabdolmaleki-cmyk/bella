import { notifySms } from "./sms.js";
import { notifyEmail } from "./emailNotify.js";

/**
 * پیامک و ایمیل «سفارش ثبت شد» به مشتری + اطلاع سفارش جدید به مدیر.
 *
 * - وقتی درگاه آنلاین فعال است، این تابع بعد از تأیید پرداخت (callback) صدا
 *   زده می‌شود؛ تا مشتری‌ای که پرداخت را لغو کرده پیامک «سفارش ثبت شد» نگیرد
 *   و مدیر هم برای سفارش پرداخت‌نشده خبر دریافت نکند.
 * - وقتی درگاه پیکربندی نشده، مثل قبل بلافاصله بعد از ثبت سفارش ارسال می‌شود.
 *
 * همه fire-and-forget هستند؛ خطای پیامک هرگز سفارش را خراب نمی‌کند.
 */
export function notifyOrderPlaced(order) {
  if (!order) return;
  const totalEn = Number(order.total || 0).toLocaleString("en-US");
  const totalFa = Number(order.total || 0).toLocaleString("fa-IR");
  const name = order.customerName || "";
  const orderId = order.code;
  const phone = order.phone || "";

  notifySms("orderPlaced", order.phone, { name, orderId, total: totalEn }).catch(() => {});
  notifyEmail("orderPlaced", order.email, { name, orderId, total: totalFa }).catch(() => {});

  notifySms("orderPlacedAdmin", null, { name, orderId, total: totalEn, phone }).catch(() => {});
  notifyEmail("orderPlacedAdmin", null, { name, orderId, total: totalFa, phone }).catch(() => {});
}
