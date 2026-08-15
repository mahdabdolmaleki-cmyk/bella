import mongoose from "mongoose";
import bcrypt from "bcryptjs";

export const OTP_PURPOSES = [
  // تنها هدف موجود: ورود/ثبت‌نام با کد یک‌بارمصرف. رمز عبور و «فراموشی رمز»
  // به‌کلی حذف شده‌اند، پس هدف‌های register/reset/admin-reset دیگر وجود ندارند.
  "login",
];

// Codes live for 5 minutes; the TTL index removes the documents automatically.
// A code can travel by SMS or by e-mail; the visitor chooses.
export const OTP_CHANNELS = ["sms", "email"];

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, maxlength: 20, index: true },
    purpose: { type: String, required: true, enum: OTP_PURPOSES },
    // How the code was delivered, and where, when the visitor picked e-mail.
    channel: { type: String, enum: OTP_CHANNELS, default: "sms" },
    email: { type: String, default: "", maxlength: 160 },
    // The code itself is NEVER stored in clear text.
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    // Short-lived ticket handed to the client after a successful verification,
    // so the final step (create account / set password) proves the OTP check.
    ticketHash: { type: String, default: null },
    ip: { type: String, default: "", maxlength: 64 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Auto-delete expired codes (TTL is handled by MongoDB itself).
otpSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: OTP_TTL_SECONDS + 10 * 60, name: "otp_ttl" }
);

otpSchema.methods.setCode = async function (code) {
  this.codeHash = await bcrypt.hash(code, 10);
};

otpSchema.methods.checkCode = function (code) {
  return bcrypt.compare(String(code), this.codeHash);
};

otpSchema.methods.isExpired = function () {
  return Date.now() - new Date(this.createdAt).getTime() > OTP_TTL_SECONDS * 1000;
};

const Otp = mongoose.model("Otp", otpSchema);
export default Otp;
