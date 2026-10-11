import mongoose from "mongoose";

// کد تخفیفِ زیرمجموعه‌گیری (v43): یکتا، یک‌بارمصرف، tied به یک کاربر، با انقضا.
// برخلاف کوپن‌های سراسری (settings.couponsJson) این کدها متعلق به یک کاربرند و
// فقط همان کاربر (owner) می‌تواند یک‌بار تا expiresAt از آن استفاده کند.
const referralCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // referrer = کد طرف معرفی‌کننده، referee = کد خود زیرمجموعه.
    kind: { type: String, enum: ["referrer", "referee"], default: "referee" },
    // یکی از این دو برندهٔ بزرگ‌تری است (مثل موتور کوپن).
    percent: { type: Number, default: 0, min: 0, max: 90 },
    amount: { type: Number, default: 0, min: 0 },
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
    usedOnOrder: { type: String, default: "" },
    // کاربر مقابل (برای گزارش).
    referralOf: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

referralCodeSchema.methods.toDTO = function () {
  return {
    code: this.code,
    kind: this.kind,
    percent: this.percent,
    amount: this.amount,
    used: this.used,
    expiresAt: this.expiresAt,
    createdAt: this.createdAt,
  };
};

const ReferralCode = mongoose.model("ReferralCode", referralCodeSchema);
export default ReferralCode;
