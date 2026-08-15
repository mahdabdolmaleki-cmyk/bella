import mongoose from "mongoose";
import bcrypt from "bcryptjs";

export const OTP_PURPOSES = [
  "login",
  "confirm-identity",
  "change-phone",
  "change-email",
];

// Codes can travel by SMS or e-mail.
export const OTP_CHANNELS = ["sms", "email"];

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, maxlength: 20, index: true },
    purpose: { type: String, required: true, enum: OTP_PURPOSES },
    // Sensitive profile OTPs are bound to the authenticated user id. Login OTPs
    // leave this empty because no user may exist yet.
    subject: { type: String, default: "", maxlength: 64 },
    // Canonical action target (for example phone:0912... or email:a@b.com).
    // It prevents a proof requested for one destination authorising another.
    target: { type: String, default: "", maxlength: 220 },
    channel: { type: String, enum: OTP_CHANNELS, default: "sms" },
    // For change-email this is also the exact new destination authorised by the
    // ticket. It stays empty for SMS and for verified e-mail removal.
    email: { type: String, default: "", maxlength: 160 },
    // The code itself is NEVER stored in clear text.
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    // Queryable digest of the 256-bit random ticket. This enables an atomic
    // findOneAndDelete instead of a race-prone read/compare/delete sequence.
    ticketDigest: { type: String, default: null },
    ticketExpiresAt: { type: Date, default: null },
    ip: { type: String, default: "", maxlength: 64 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Auto-delete codes and their short-lived tickets after the maximum lifecycle.
otpSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: OTP_TTL_SECONDS + 10 * 60, name: "otp_ttl" }
);
otpSchema.index(
  { ticketDigest: 1 },
  {
    name: "otp_ticket_digest",
    partialFilterExpression: { ticketDigest: { $type: "string" } },
  }
);
otpSchema.index(
  { phone: 1, purpose: 1, subject: 1, createdAt: -1 },
  { name: "otp_scope_created" }
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
