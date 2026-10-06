import AbandonedCart from "../models/AbandonedCart.js";
import Settings from "../models/Settings.js";
import { sendEventSms } from "../utils/sms.js";
import { notifyEmail } from "../utils/emailNotify.js";

const INTERVAL_MS = 5 * 60 * 1000; // هر 5 دقیقه چک کن
const BATCH = 50;

function toFaMoney(n) {
  return Number(n || 0).toLocaleString("en-US");
}

async function processAbandonedCarts() {
  try {
    const settingsDoc = await Settings.getSingleton().catch(() => null);
    if (!settingsDoc) return 0;
    const s = settingsDoc.toDTO(true);

    // اگر کل فیچر خاموش است، کاری نکن
    if (s.abandonedCartEnabled !== "1") return 0;

    const firstHours = Math.max(1, Math.min(168, Number(s.abandonedCartFirstHours) || 2));
    const secondHours = Math.max(1, Math.min(720, Number(s.abandonedCartSecondHours) || 12));

    // اگر ساعت دوم کوچکتر از اول باشد، دوم را برابر اول + 1 بگذار
    const secondHoursSafe = secondHours <= firstHours ? firstHours + 1 : secondHours;

    const now = new Date();
    const firstCutoff = new Date(now.getTime() - firstHours * 3600 * 1000);
    const secondCutoff = new Date(now.getTime() - secondHoursSafe * 3600 * 1000);

    let sent = 0;

    // ---- مرحله اول: 2 ساعته ----
    if (s.smsAbandonedFirstEnabled === "1" && s.smsirAbandonedFirstTemplate) {
      const firstBatch = await AbandonedCart.find({
        converted: false,
        firstSent: false,
        lastUpdated: { $lte: firstCutoff },
        phone: { $ne: "" },
      })
        .sort({ lastUpdated: 1 })
        .limit(BATCH);

      for (const cart of firstBatch) {
        try {
          const phone = cart.phone;
          if (!phone) continue;
          const total = toFaMoney(cart.subtotal);
          const name = cart.name || "مشتری بلا";

          const r = await sendEventSms("abandonedFirst", phone, {
            name,
            total,
            orderId: "",
            status: "",
          });

          // ایمیل همزمان اگر فعال باشد
          if (cart.email) {
            notifyEmail("abandonedFirst", cart.email, { name, total }).catch(()=>{});
          }

          if (r.ok) {
            cart.firstSent = true;
            cart.firstSentAt = new Date();
            await cart.save();
            sent++;
            console.log(`[abandoned] first reminder sent to ${phone} (${cart.subtotal})`);
          } else {
            console.warn(`[abandoned] first failed for ${phone}: ${r.error}`);
          }
        } catch (e) {
          console.warn(`[abandoned] first error: ${e?.message}`);
        }
      }
    }

    // ---- مرحله دوم: 12 ساعته ----
    if (s.smsAbandonedSecondEnabled === "1" && s.smsirAbandonedSecondTemplate) {
      const secondBatch = await AbandonedCart.find({
        converted: false,
        firstSent: true,
        secondSent: false,
        lastUpdated: { $lte: secondCutoff },
        phone: { $ne: "" },
      })
        .sort({ lastUpdated: 1 })
        .limit(BATCH);

      for (const cart of secondBatch) {
        try {
          const phone = cart.phone;
          if (!phone) continue;
          const total = toFaMoney(cart.subtotal);
          const name = cart.name || "مشتری بلا";

          const r = await sendEventSms("abandonedSecond", phone, {
            name,
            total,
            orderId: "",
            status: "",
          });

          if (cart.email) {
            notifyEmail("abandonedSecond", cart.email, { name, total }).catch(()=>{});
          }

          if (r.ok) {
            cart.secondSent = true;
            cart.secondSentAt = new Date();
            await cart.save();
            sent++;
            console.log(`[abandoned] second reminder sent to ${phone} (${cart.subtotal})`);
          } else {
            console.warn(`[abandoned] second failed for ${phone}: ${r.error}`);
          }
        } catch (e) {
          console.warn(`[abandoned] second error: ${e?.message}`);
        }
      }
    }

    // پاکسازی: کارت‌هایی که بیش از 30 روز از آخرین آپدیتشان گذشته و تبدیل نشده‌اند را حذف کن
    const cleanupCutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    await AbandonedCart.deleteMany({
      converted: false,
      lastUpdated: { $lt: cleanupCutoff },
    }).catch(() => {});

    return sent;
  } catch (err) {
    console.error("[abandoned] sweep error:", err?.message);
    return 0;
  }
}

export function startAbandonedCartSweeper() {
  setTimeout(() => {
    processAbandonedCarts().catch(() => {});
  }, 30_000).unref();

  const timer = setInterval(() => {
    processAbandonedCarts().catch(() => {});
  }, INTERVAL_MS);
  timer.unref();
  return timer;
}

export { processAbandonedCarts };
