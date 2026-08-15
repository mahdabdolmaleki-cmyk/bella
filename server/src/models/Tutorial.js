import mongoose from "mongoose";
import { nextSequence } from "./Counter.js";

/**
 * مطلب آموزشی (آکادمی بلّا).
 *
 * هر مطلب از چند بلوک ساخته می‌شود: متن، عکس، ویدئو و نکته. دلیل
 * بلوکی بودن این است که ادمین بتواند ترتیب دلخواه بسازد (مثلاً متن ،
 * بعد ویدئو ، بعد دوباره متن) بدون اینکه مجبور باشد HTML بنویسد.
 *
 * رأی‌ها (لایک/دیس‌لایک) در مجموعهٔ جداگانهٔ TutorialVote ذخیره می‌شوند تا
 * هر نفر فقط یک بار بتواند رأی بدهد؛ شمارنده‌های روی همین سند فقط کپیٔ
 * سریع هستند تا فهرست مطالب به یک کوئری اضافی نیاز نداشته باشد.
 */

export const TUTORIAL_BLOCK_TYPES = ["text", "image", "video", "note"];

const blockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TUTORIAL_BLOCK_TYPES, default: "text" },
    // متن بلوک متنی/نکته، یا زیرنویس عکس و ویدئو.
    text: { type: String, default: "", maxlength: 6000 },
    // نشانی عکس (آپلودشده) یا ویدئو.
    src: { type: String, default: "", maxlength: 600 },
  },
  { _id: false },
);

const tutorialSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    // دسته‌بندی آزاد است، نه enum: فهرست دسته‌ها را ادمین در تنظیمات
    // سایت می‌سازد، پس مدل نباید آن را قفل کند.
    category: { type: String, default: "عمومی", trim: true, maxlength: 60, index: true },
    excerpt: { type: String, default: "", maxlength: 400 },
    cover: { type: String, default: "", maxlength: 600 },
    // ویدئوی اصلی که بالای مطلب پخش می‌شود (اختیاری).
    video: { type: String, default: "", maxlength: 600 },
    blocks: {
      type: [blockSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 40,
        message: "حداکثر ۴۰ بلوک در هر آموزش مجاز است.",
      },
    },
    published: { type: Boolean, default: true, index: true },
    // ترتیب دستی در فهرست؛ کوچکتر = بالاتر.
    order: { type: Number, default: 0 },
    views: { type: Number, default: 0, min: 0 },
    likes: { type: Number, default: 0, min: 0 },
    dislikes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

tutorialSchema.index({ published: 1, order: 1, createdAt: -1 });

tutorialSchema.pre("save", async function () {
  if (this.id == null) this.id = await nextSequence("tutorial");
});

// خلاصهٔ فهرست — بدون بلوک‌ها، تا صفحهٔ فهرست سبک بماند.
tutorialSchema.methods.toCardDTO = function () {
  return {
    id: this.id,
    title: this.title,
    category: this.category,
    excerpt: this.excerpt,
    cover: this.cover,
    hasVideo: Boolean(this.video) || this.blocks.some((b) => b.type === "video" && b.src),
    likes: this.likes,
    dislikes: this.dislikes,
    views: this.views,
    createdAt: this.createdAt,
  };
};

tutorialSchema.methods.toDTO = function () {
  return {
    ...this.toCardDTO(),
    video: this.video,
    blocks: this.blocks.map((b) => ({ type: b.type, text: b.text, src: b.src })),
  };
};

tutorialSchema.methods.toAdminDTO = function () {
  return {
    ...this.toDTO(),
    published: Boolean(this.published),
    order: this.order ?? 0,
    updatedAt: this.updatedAt,
  };
};

const Tutorial = mongoose.model("Tutorial", tutorialSchema);
export default Tutorial;
