import mongoose from "mongoose";

/**
 * یک رأی (لایک یا دیس‌لایک) برای یک آموزش.
 *
 * اگر فقط شمارنده را روی خود مطلب زیاد می‌کردیم، هر کسی می‌توانست با
 * نگه‌داشتن دکمه عدد را بالا ببرد. پس هر رأی یک سند می‌شود و ایندکس
 * یکتای (tutorial, voter) اجازهٔ رأی دوم را نمی‌دهد.
 *
 * voter برای کاربر واردشده «u:<id>» است و برای مهمان «ip:<hash>». آی‌پی خام
 * ذخیره نمی‌شود؛ هش می‌شود تا فهرست رأی‌ها خودش به یک لاگ آی‌پی تبدیل نشود.
 */
const tutorialVoteSchema = new mongoose.Schema(
  {
    tutorial: { type: Number, required: true, index: true },
    voter: { type: String, required: true, maxlength: 120 },
    value: { type: Number, enum: [1, -1], required: true },
  },
  { timestamps: true },
);

tutorialVoteSchema.index({ tutorial: 1, voter: 1 }, { unique: true });

const TutorialVote = mongoose.model("TutorialVote", tutorialVoteSchema);
export default TutorialVote;
