import mongoose from "mongoose";

// How long a log line is kept. Default: exactly one week.
export const LOG_TTL_DAYS = Math.min(
  365,
  Math.max(1, Number(process.env.LOG_RETENTION_DAYS) || 7)
);

const activityLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, maxlength: 60, index: true },
    // "admin" | "user" | "guest"
    actorType: { type: String, default: "guest", maxlength: 20, index: true },
    actorId: { type: String, default: "", maxlength: 64 },
    actorLabel: { type: String, default: "", maxlength: 160 },
    // The thing that was touched, e.g. "product#12" or "user@mail.com"
    target: { type: String, default: "", maxlength: 200 },
    method: { type: String, default: "", maxlength: 10 },
    path: { type: String, default: "", maxlength: 200 },
    status: { type: Number, default: 0 },
    success: { type: Boolean, default: true, index: true },
    // The requested information: the caller's IP address is always stored.
    ip: { type: String, default: "", maxlength: 64, index: true },
    userAgent: { type: String, default: "", maxlength: 300 },
    meta: { type: String, default: "", maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// TTL index: MongoDB deletes each document automatically once it is older than
// LOG_TTL_DAYS (7 days by default). No cron job required.
activityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: LOG_TTL_DAYS * 24 * 60 * 60, name: "activity_ttl" }
);

activityLogSchema.methods.toDTO = function () {
  return {
    id: String(this._id),
    action: this.action,
    actorType: this.actorType,
    actorId: this.actorId || "",
    actorLabel: this.actorLabel || "",
    target: this.target || "",
    method: this.method || "",
    path: this.path || "",
    status: this.status || 0,
    success: this.success,
    ip: this.ip || "",
    userAgent: this.userAgent || "",
    meta: this.meta || "",
    createdAt: this.createdAt,
  };
};

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
export default ActivityLog;
