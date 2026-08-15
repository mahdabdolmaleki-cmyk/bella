import mongoose from "mongoose";
import bcrypt from "bcryptjs";

export const ADMIN_ROLES = ["owner", "admin", "viewer"];

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    // Never selected by default — the hash can only leak if asked for explicitly.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, default: "admin" },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: "", maxlength: 64 },
    // HARDENING: bumped on every password change / deactivation so admin
    // cookies already sitting in other browsers stop working immediately.
    tokenVersion: { type: Number, default: 0, select: false },
    // HARDENING: progressive per-account lock-out. The IP rate limit alone did
    // not stop a distributed password-guessing attack on one known e-mail.
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

adminUserSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
  // Invalidate every existing admin session for this account.
  this.tokenVersion = (this.tokenVersion || 0) + 1;
  this.failedAttempts = 0;
  this.lockedUntil = null;
};

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

adminUserSchema.methods.isLocked = function () {
  return Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
};

adminUserSchema.methods.registerFailure = async function () {
  this.failedAttempts = (this.failedAttempts || 0) + 1;
  if (this.failedAttempts >= MAX_FAILED) {
    this.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    this.failedAttempts = 0;
  }
  await this.save().catch(() => {});
};

adminUserSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash || "");
};

adminUserSchema.methods.toDTO = function () {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    role: this.role,
    active: this.active,
    lastLoginAt: this.lastLoginAt,
    lastLoginIp: this.lastLoginIp || "",
    locked: Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now()),
    lockedUntil: this.lockedUntil ?? null,
    createdAt: this.createdAt,
  };
};

adminUserSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

const AdminUser = mongoose.model("AdminUser", adminUserSchema);
export default AdminUser;
