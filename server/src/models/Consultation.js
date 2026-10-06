import mongoose from "mongoose";
import { nextSequence } from "./Counter.js";

const consultationSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true },
    forWhom: { type: String, default: "", maxlength: 40 },
    gender: { type: String, default: "", maxlength: 20 },
    ageRange: { type: String, default: "", maxlength: 20 },
    occasions: { type: [String], default: [] },
    image: { type: [String], default: [] },
    scentStylesLiked: { type: [String], default: [] },
    dislikedScents: { type: String, default: "", maxlength: 500 },
    favoritePerfumeName: { type: String, default: "", maxlength: 120 },
    favoriteReason: { type: [String], default: [] },
    mostImportantCriteria: { type: String, default: "", maxlength: 40 },
    desiredEffect: { type: String, default: "", maxlength: 60 },
    triedPerfumes: { type: String, default: "", maxlength: 500 },
    dislikedPerfumes: { type: String, default: "", maxlength: 500 },
    budget: { type: String, default: "", maxlength: 20 },
    goldenSentence: { type: String, default: "", maxlength: 300 },
    name: { type: String, default: "", maxlength: 80 },
    phone: { type: String, default: "", maxlength: 20 },
    email: { type: String, default: "", maxlength: 160 },
    instagram: { type: String, default: "", maxlength: 80 },
    recommendedProductId: { type: Number, default: null },
    recommendation: {
      productName: { type: String, default: "" },
      why: { type: String, default: "", maxlength: 1000 },
      feeling: { type: String, default: "", maxlength: 500 },
      suitableFor: { type: String, default: "", maxlength: 500 },
      bestTime: { type: String, default: "", maxlength: 300 },
      similar: { type: [String], default: [] },
    },
    status: { type: String, default: "جدید", enum: ["جدید", "بررسی شد", "پاسخ داده شد"] },
  },
  { timestamps: true }
);

consultationSchema.pre("save", async function () {
  if (this.id == null) this.id = await nextSequence("consultation");
});

consultationSchema.methods.toDTO = function () {
  return {
    id: this.id,
    forWhom: this.forWhom,
    gender: this.gender,
    ageRange: this.ageRange,
    occasions: this.occasions,
    image: this.image,
    scentStylesLiked: this.scentStylesLiked,
    dislikedScents: this.dislikedScents,
    favoritePerfumeName: this.favoritePerfumeName,
    favoriteReason: this.favoriteReason,
    mostImportantCriteria: this.mostImportantCriteria,
    desiredEffect: this.desiredEffect,
    triedPerfumes: this.triedPerfumes,
    dislikedPerfumes: this.dislikedPerfumes,
    budget: this.budget,
    goldenSentence: this.goldenSentence,
    name: this.name,
    phone: this.phone,
    email: this.email,
    instagram: this.instagram,
    recommendedProductId: this.recommendedProductId,
    recommendation: this.recommendation,
    status: this.status,
    createdAt: this.createdAt,
  };
};

const Consultation = mongoose.model("Consultation", consultationSchema);
export default Consultation;
