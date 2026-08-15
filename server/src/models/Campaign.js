import mongoose from "mongoose";

/**
 * A record of every announcement e-mail the shop sends to its customers,
 * whether it went to everybody (بخش اطلاع‌رسانی همگانی) or to a hand-picked
 * list. Keeping the history makes it possible to answer "did the customer
 * actually receive the festival e-mail?" months later, and it lets the admin
 * panel show what was sent, to how many people, and how many failed.
 */
const campaignSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, maxlength: 8000 },
    // "all" = every active customer, "selected" = the chosen recipients only.
    audience: { type: String, enum: ["all", "selected"], default: "selected" },
    // How many addresses were attempted / delivered / rejected.
    total: { type: Number, default: 0, min: 0 },
    sent: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    // A short sample of the addresses, for the history list. The full list is
    // intentionally not stored: it would grow unbounded for large sends.
    sampleRecipients: { type: [String], default: [] },
    // First error message, if any, so the admin can see *why* a send failed.
    lastError: { type: String, default: "", maxlength: 300 },
    sentByLabel: { type: String, default: "", maxlength: 160 },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

campaignSchema.methods.toDTO = function () {
  return {
    id: this._id.toString(),
    subject: this.subject,
    body: this.body,
    audience: this.audience,
    total: this.total,
    sent: this.sent,
    failed: this.failed,
    sampleRecipients: Array.isArray(this.sampleRecipients) ? this.sampleRecipients : [],
    lastError: this.lastError,
    sentByLabel: this.sentByLabel,
    createdAt: this.createdAt,
  };
};

const Campaign = mongoose.model("Campaign", campaignSchema);
export default Campaign;
