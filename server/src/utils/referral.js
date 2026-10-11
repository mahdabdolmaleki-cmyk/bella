import crypto from "crypto";
import ReferralCode from "../models/ReferralCode.js";
import User from "../models/User.js";
import { sendTemplateSms } from "./sms.js";

// تولید کد یکتا با crypto (غیرقابل‌حدس) — حروف+عدد، بدون کاراکترهای مبهم.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randCode(len = 7) {
  const bytes = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

// سقف پاداش زیرمجموعه‌گیری برای هر معرف (جلوگیری از ساخت اکانت انبوه).
const MAX_REFERRAL_REWARDS_PER_REFERRER = 100;

/** کد معرف یکتای کاربر را برمی‌گرداند (در نبود، می‌سازد و ذخیره می‌کند). */
export async function ensureReferralCode(user) {
  if (user.referralCode) return user.referralCode;
  for (let i = 0; i < 8; i++) {
    const code = "BL" + randCode(6);
    const clash = await User.findOne({ referralCode: code }).select("_id").lean();
    if (!clash) {
      user.referralCode = code;
      await user.save();
      return code;
    }
  }
  return "";
}

function discountFields(type, value) {
  const v = Math.max(0, Number(value) || 0);
  return String(type) === "amount" ? { amount: v, percent: 0 } : { percent: Math.min(90, v), amount: 0 };
}

async function issueCode(owner, kind, settings, referralOf) {
  const isRef = kind === "referrer";
  const type = isRef ? settings.referrerType : settings.refereeType;
  const value = isRef ? settings.referrerValue : settings.refereeValue;
  const days = Math.max(1, Number(isRef ? settings.referrerDays : settings.refereeDays) || (isRef ? 10 : 3));
  const { percent, amount } = discountFields(type, value);
  let code = "";
  for (let i = 0; i < 8; i++) {
    const c = (isRef ? "R" : "Z") + randCode(6);
    const clash = await ReferralCode.findOne({ code: c }).select("_id").lean();
    if (!clash) { code = c; break; }
  }
  if (!code) return null;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await ReferralCode.create({ code, owner: owner._id, kind, percent, amount, referralOf: referralOf?._id ?? null, expiresAt });
  return { code, days, percent, amount };
}

/**
 * برقراری رابطهٔ زیرمجموعه هنگام ثبت‌نام و صدور آنیِ پاداش دو طرف:
 *  - یک کد تخفیف یک‌بارمصرف برای معرف (مهلت referrerDays)
 *  - یک کد تخفیف یک‌بارمصرف برای زیرمجموعه (مهلت refereeDays)
 *  - امتیاز وفاداری برای معرف (referralPoints)
 *  - پیامک قالبی به هر دو طرف (طبق تنظیمات پیامک)
 * اگر کد معرف نامعتبر/خود/تکراری باشد، بی‌اثر است و null برمی‌گرداند.
 */
export async function applyReferral(newUser, rawCode, settings) {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code) return null;
  if (newUser.referredBy) return null;

  const referrer = await User.findOne({ referralCode: code, deletedAt: null });
  if (!referrer || String(referrer._id) === String(newUser._id)) return null;

  newUser.referredBy = referrer._id;
  await ensureReferralCode(newUser);
  await newUser.save();

  const referredCount = await User.countDocuments({ referredBy: referrer._id });
  const canRewardReferrer = referredCount <= MAX_REFERRAL_REWARDS_PER_REFERRER;
  const refReward = canRewardReferrer
    ? await issueCode(referrer, "referrer", settings, newUser)
    : null;
  const subReward = await issueCode(newUser, "referee", settings, referrer);

  const points = canRewardReferrer ? Math.max(0, Number(settings.referralPoints) || 0) : 0;
  if (points > 0) await User.updateOne({ _id: referrer._id }, { $inc: { points } });

  // پیامک قالبی به هر دو طرف.
  const tid = settings.referralSmsTemplate;
  if (tid) {
    try {
      if (refReward && referrer.phone) {
        await sendTemplateSms(referrer.phone, tid, { CODE: refReward.code, DAYS: refReward.days, NAME: referrer.name || "" });
      }
      if (subReward && newUser.phone) {
        await sendTemplateSms(newUser.phone, tid, { CODE: subReward.code, DAYS: subReward.days, NAME: newUser.name || "" });
      }
    } catch {
      /* خطای پیامک نباید ثبت‌نام را خراب کند */
    }
  }

  return { referrerCode: refReward?.code || "", refereeCode: subReward?.code || "", points };
}
