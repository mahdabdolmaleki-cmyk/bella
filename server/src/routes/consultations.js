import { Router } from "express";
import Consultation from "../models/Consultation.js";
import Product from "../models/Product.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../utils/asyncHandler.js";
import { str } from "../utils/validate.js";
import { requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.post(
  "/",
  rateLimit({ name: "consultation", windowMs: 60 * 60 * 1000, max: 20 }),
  ah(async (req, res) => {
    const body = req.body || {};
    const data = {
      forWhom: str(body.forWhom, { max: 40 }),
      gender: str(body.gender, { max: 20 }),
      ageRange: str(body.ageRange, { max: 20 }),
      occasions: Array.isArray(body.occasions) ? body.occasions.map((x) => str(x, { max: 40 })).filter(Boolean).slice(0, 10) : [],
      image: Array.isArray(body.image) ? body.image.map((x) => str(x, { max: 40 })).filter(Boolean).slice(0, 3) : [],
      scentStylesLiked: Array.isArray(body.scentStylesLiked) ? body.scentStylesLiked.map((x) => str(x, { max: 30 })).filter(Boolean).slice(0, 15) : [],
      dislikedScents: str(body.dislikedScents, { max: 500 }),
      favoritePerfumeName: str(body.favoritePerfumeName, { max: 120 }),
      favoriteReason: Array.isArray(body.favoriteReason) ? body.favoriteReason.map((x) => str(x, { max: 40 })).filter(Boolean).slice(0, 6) : [],
      mostImportantCriteria: str(body.mostImportantCriteria, { max: 40 }),
      desiredEffect: str(body.desiredEffect, { max: 60 }),
      triedPerfumes: str(body.triedPerfumes, { max: 500 }),
      dislikedPerfumes: str(body.dislikedPerfumes, { max: 500 }),
      budget: str(body.budget, { max: 20 }),
      goldenSentence: str(body.goldenSentence, { max: 300 }),
      name: str(body.name, { max: 80 }),
      phone: str(body.phone, { max: 20 }),
      email: str(body.email, { max: 160 }),
      instagram: str(body.instagram, { max: 80 }),
    };

    if (!data.gender && data.scentStylesLiked.length === 0) {
      return res.status(400).json({ error: "لطفا حداقل جنسیت یا سبک رایحه را انتخاب کنید." });
    }

    let recommendedProductId = null;
    let recommendation = {
      productName: "",
      why: "",
      feeling: "",
      suitableFor: "",
      bestTime: "",
      similar: [],
    };

    try {
      const products = await Product.find({ active: true }).limit(200);
      if (products.length > 0) {
        const scores = products.map((p) => {
          let score = 0;
          const hay = [p.topNotes, p.heartNotes, p.baseNotes, p.scentType, p.scentStructure, p.tagline, p.description, p.season, p.category]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (data.gender) {
            if (data.gender.includes("زنانه") && p.category?.includes("زنانه")) score += 5;
            if (data.gender.includes("مردانه") && p.category?.includes("مردانه")) score += 5;
            if (data.gender.includes("یونیسکس") && p.category?.includes("یونیسکس")) score += 5;
            if (p.category?.includes("یونیسکس")) score += 2;
          }

          const scentMap = {
            شیرین: ["شیرین", "وانیل", "کارامل", "sweet", "vanilla"],
            تلخ: ["تلخ", "قهوه", "چرم", "bitter"],
            "خنک و تازه": ["تازه", "خنک", "مرکبات", "fresh", "citrus"],
            "گرم و عمیق": ["گرم", "عمیق", "کهربا", "warm"],
            چوبی: ["چوب", "صندل", "woody"],
            مرکباتی: ["مرکبات", "لیمو", "citrus"],
            "ادویه‌ای": ["ادویه", "دارچین", "spicy"],
            گلی: ["گل", "رز", "floral"],
            وانیلی: ["وانیل", "vanilla"],
            چرمی: ["چرم", "leather"],
            "شرقی و لوکس": ["شرقی", "لوکس", "oriental", "luxury"],
          };

          for (const liked of data.scentStylesLiked) {
            const keywords = scentMap[liked] || [liked.toLowerCase()];
            for (const kw of keywords) {
              if (hay.includes(kw.toLowerCase())) score += 3;
            }
          }

          if (data.budget === "اقتصادی" && p.price < 2000000) score += 2;
          if (data.budget === "متوسط" && p.price >= 2000000 && p.price <= 5000000) score += 2;
          if (data.budget === "لوکس" && p.price > 5000000) score += 2;

          if (p.bestseller) score += 1;

          return { p, score };
        });

        scores.sort((a, b) => b.score - a.score);
        const top = scores[0];
        if (top) {
          recommendedProductId = top.p.id;
          const top3 = scores.slice(0, 4).map((x) => x.p.name);
          const imageText = data.image.length ? data.image[0] : "شیک و باکلاس";
          const occasionText = data.occasions.length ? data.occasions[0] : "استفاده روزانه";
          const why = `با توجه به اینکه شما فردی هستید که به دنبال حس ${imageText} هستید و بیشتر در موقعیت ${occasionText} از عطر استفاده می‌کنید، این رایحه می‌تواند هماهنگی بیشتری با سبک شما داشته باشد. ${top.p.name} با رایحه ${top.p.scentType || top.p.tagline || ""} می‌تواند انتخابی هماهنگ با معیار ${data.mostImportantCriteria || "شما"} باشد.`;

          recommendation = {
            productName: top.p.name,
            why,
            feeling: `${top.p.scentType || top.p.tagline || "گرم و ماندگار"} — ${top.p.topNotes ? `شروع با ${top.p.topNotes}، ` : ""}قلب ${top.p.heartNotes || "گلی و خاص"} و پایه ${top.p.baseNotes || "چوبی و ماندگار"}`,
            suitableFor: `${data.gender || "همه"}، ${data.ageRange || "همه سنین"} — ${data.image.join("، ") || "شیک و جذاب"}`,
            bestTime: `${top.p.season || "چهار فصل"} — ${data.occasions.join("، ") || "روزمره و رسمی"}`,
            similar: top3.slice(1),
          };
        }
      }
    } catch (e) {
      console.warn("consultation recommendation failed", e?.message);
    }

    const doc = await Consultation.create({
      ...data,
      recommendedProductId,
      recommendation,
    });

    res.status(201).json({ ok: true, consultation: doc.toDTO() });
  })
);

router.get(
  "/",
  requireAdmin,
  ah(async (req, res) => {
    const list = await Consultation.find().sort({ createdAt: -1 }).limit(200);
    res.json({ consultations: list.map((c) => c.toDTO()) });
  })
);

router.patch(
  "/:id",
  requireAdmin,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const status = str(req.body?.status, { max: 20 });
    if (!["جدید", "بررسی شد", "پاسخ داده شد"].includes(status)) {
      return res.status(400).json({ error: "وضعیت نامعتبر" });
    }
    const doc = await Consultation.findOne({ id });
    if (!doc) return res.status(404).json({ error: "یافت نشد" });
    doc.status = status;
    await doc.save();
    res.json({ ok: true, consultation: doc.toDTO() });
  })
);

export default router;
