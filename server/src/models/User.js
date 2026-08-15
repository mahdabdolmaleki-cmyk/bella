import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // `unique: true` builds the index already; `index: true` duplicated it.
    // ایمیل دیگر اجباری نیست: کاربر با شماره + کد وارد می‌شود و بعداً می‌تواند
    // ایمیل را در پروفایل ثبت/ویرایش کند. sparse تا چند حساب بدون ایمیل مجاز باشد.
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true, maxlength: 160, default: undefined },
    // Phone is the primary identity for OTP sign-up/recovery.
    phone: { type: String, default: "", maxlength: 20, index: true },
    phoneVerified: { type: Boolean, default: false },
    address: { type: String, default: "", maxlength: 500 },
    // Default delivery destination, reused to pre-fill checkout and to quote
    // shipping before the buyer types anything.
    province: { type: String, default: "", maxlength: 40 },
    city: { type: String, default: "", maxlength: 60 },
    postalCode: { type: String, default: "", maxlength: 10 },
    // رمز عبور حذف شده است؛ این فیلد فقط برای سازگاری با داده‌های قدیمی می‌ماند
    // و هرگز برای ورود استفاده نمی‌شود. select: false تا هیچ‌گاه لو نرود.
    passwordHash: { type: String, default: "", select: false },
    // Soft delete: rows are kept for accounting/traceability.
    deletedAt: { type: Date, default: null, index: true },
    // Bumped on password reset / forced logout so JWTs issued for OTHER devices
    // stop working immediately (clearing one cookie only logged out one browser).
    tokenVersion: { type: Number, default: 0, select: false },
    // Favourite products (فهرست علاقه‌مندی‌ها). Stores the public numeric Product.id,
    // not ObjectIds, so the storefront can match them without an extra lookup.
    favorites: { type: [Number], default: [] },
  },
  { timestamps: true },
);

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Never leak the password hash to the client.
userSchema.methods.toDTO = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone,
    phoneVerified: Boolean(this.phoneVerified),
    address: this.address,
    province: this.province,
    city: this.city,
    postalCode: this.postalCode,
    favorites: Array.isArray(this.favorites) ? this.favorites : [],
  };
};

// Extra safety net: even a raw res.json(user) can never expose the hash.
userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);
export default User;
