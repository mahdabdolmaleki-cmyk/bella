import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // E-mail and phone are independent verified login identities. `sparse`
    // allows phone-only accounts to omit e-mail while keeping e-mails unique.
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
      default: undefined,
    },
    emailVerified: { type: Boolean, default: false },
    // E-mail-only accounts may add a phone later. The partial unique index below
    // excludes rows whose phone is still empty.
    phone: { type: String, default: "", maxlength: 20 },
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

userSchema.index(
  { phone: 1 },
  {
    unique: true,
    name: "user_phone_unique",
    partialFilterExpression: { phone: { $type: "string", $gt: "" } },
  }
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
    emailVerified: Boolean(this.emailVerified),
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
