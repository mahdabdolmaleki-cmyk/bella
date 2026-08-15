import mongoose from "mongoose";
import { nextSequence } from "./Counter.js";

/**
 * نظر کاربر ذیل یک آموزش.
 *
 * برخلاف نقد محصول، اینجا عمداً هیچ امتیاز ستاره‌ای وجود ندارد — یک مطلب
 * آموزشی را نمی‌شود مثل کالا نمره داد؛ برای آن لایک/دیس‌لایک داریم.
 *
 * مثل نقدها، هر نظر تا تأیید ادمین در سایت دیده نمی‌شود؛ فرم باز نظر
 * ساده‌ترین راه ورود هرزنامه است.
 */
export const TUTORIAL_COMMENT_STATUSES = ["pending", "approved", "rejected"];

const tutorialCommentSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true },
    // شناسهٔ عددی عمومی آموزش (Tutorial.id)، نه ObjectId.
    tutorial: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    body: { type: String, required: true, trim: true, maxlength: 1500 },
    status: {
      type: String,
      enum: TUTORIAL_COMMENT_STATUSES,
      default: "pending",
      index: true,
    },
    reply: {
      body: { type: String, default: "", maxlength: 1500 },
      author: { type: String, default: "", maxlength: 80 },
      at: { type: Date, default: null },
    },
    // فقط برای پیگیری سوءاستفاده؛ هرگز به سایت برنمی‌گردد.
    ip: { type: String, default: "", maxlength: 60, select: false },
  },
  { timestamps: true },
);

tutorialCommentSchema.index({ tutorial: 1, status: 1, createdAt: -1 });
tutorialCommentSchema.index({ status: 1, createdAt: -1 });

tutorialCommentSchema.pre("save", async function () {
  if (this.id == null) this.id = await nextSequence("tutorialComment");
});

tutorialCommentSchema.methods.toDTO = function () {
  return {
    id: this.id,
    tutorial: this.tutorial,
    name: this.name,
    body: this.body,
    createdAt: this.createdAt,
    reply: this.reply?.body
      ? { body: this.reply.body, author: this.reply.author, at: this.reply.at }
      : null,
  };
};

tutorialCommentSchema.methods.toAdminDTO = function () {
  return {
    ...this.toDTO(),
    status: this.status,
    user: this.user ? String(this.user) : null,
  };
};

const TutorialComment = mongoose.model("TutorialComment", tutorialCommentSchema);
export default TutorialComment;
