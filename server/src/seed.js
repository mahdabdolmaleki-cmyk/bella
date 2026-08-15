import dotenv from "dotenv";
import mongoose from "mongoose";

import { connectDB } from "./config/db.js";
import Counter from "./models/Counter.js";
import Product from "./models/Product.js";
import Settings, { DEFAULT_SETTINGS } from "./models/Settings.js";
import User from "./models/User.js";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bella";

const seedProducts = [
    {
        name: "بلّا امپراتریس",
        nameEn: "Bella Empress",
        tagline: "امضای ملکه‌ی شب‌های طلایی",
        description:
            "ترکیبی شاهانه از زعفران ایرانی و رز دمشقی که همچون ردای مخملی بر پوست می‌نشیند و حضوری فراموش‌نشدنی می‌سازد.",
        topNotes: "زعفران، ترنج کالابریا",
        heartNotes: "رز دمشقی، یاس شب‌بو",
        baseNotes: "عنبر خاکستری، مشک سفید",
        longevity: "۱۲+ ساعت",
        sillage: "افسونگر و گسترده",
        price: 4850000,
        oldPrice: 6200000,
        sizeMl: 100,
        glass: "#0e3b26",
        liquid: "#1d6b43",
        category: "زنانه",
        badge: "پرفروش‌ترین",
        bestseller: true,
        active: true,
        image: null,
        stock: 25,
        allowBackorder: false,
    },
    {
        name: "شبِ زرین",
        nameEn: "Golden Night",
        tagline: "برای شب‌هایی که نباید فراموش شوند",
        description:
            "عود کم‌نظیر هندی در آغوش وانیل ماداگاسکار؛ عطری گرم و مخملی که فضا را طلایی می‌کند و اعتمادبه‌نفس را بیدار.",
        topNotes: "هل سبز، دارچین سیلان",
        heartNotes: "عود هندی، چوب صندل",
        baseNotes: "وانیل، عنبر طلایی",
        longevity: "۱۴+ ساعت",
        sillage: "بسیار پخش‌بو",
        price: 5400000,
        oldPrice: null,
        sizeMl: 100,
        glass: "#3a2a10",
        liquid: "#8a6420",
        category: "مردانه",
        badge: "لوکس",
        bestseller: true,
        active: true,
        image: null,
        stock: 25,
        allowBackorder: false,
    },
    {
        name: "یاسمین رویال",
        nameEn: "Jasmine Royal",
        tagline: "نجابتِ گل‌های سپیده‌دم",
        description:
            "یاس بیدمشک مصری با شبنم صبحگاهی سرده شده؛ عطری روشن، ابریشمی و بی‌نهایت زنانه برای روزهای خاص.",
        topNotes: "شکوفه پرتقال، گلابی",
        heartNotes: "یاس بیدمشک، مریم",
        baseNotes: "مشک ابریشمی، سدر سفید",
        longevity: "۸+ ساعت",
        sillage: "ملایم و نزدیک",
        price: 3980000,
        oldPrice: 4500000,
        sizeMl: 75,
        glass: "#3d1622",
        liquid: "#7c2d43",
        category: "زنانه",
        badge: "تخفیف جشنواره",
        bestseller: false,
        active: true,
        image: null,
        stock: 25,
        allowBackorder: false,
    },
];

async function seed() {
    // This script deletes every product, setting and user. Refuse to run it
    // against production unless it is explicitly forced.
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "yes") {
        throw new Error(
            "Refusing to seed in production. Set ALLOW_PROD_SEED=yes if you really mean it.",
        );
    }

    if (mongoose.connection.readyState === 0) {
        await connectDB(mongoUri);
    }

    await Promise.all([
        Product.deleteMany({}),
        Settings.deleteMany({}),
        User.deleteMany({}),
    ]);

    const siteSettings = await Settings.create({
        key: "site",
        festivalActive: DEFAULT_SETTINGS.festivalActive,
        festivalTitle: DEFAULT_SETTINGS.festivalTitle,
        festivalSubtitle: DEFAULT_SETTINGS.festivalSubtitle,
        footerAbout: DEFAULT_SETTINGS.footerAbout,
    });

    await Counter.deleteMany({});

    const createdProducts = [];
    for (const productData of seedProducts) {
        const product = new Product(productData);
        await product.save();
        createdProducts.push(product);
    }

    console.log("✓ Seed completed");
    console.log("- Settings:", siteSettings.key);
    console.log("- Products created:", createdProducts.length);
}

seed()
    .catch((error) => {
        console.error("Seed failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        // BUG FIX: the connection stayed open, so `npm run seed` never exited.
        await mongoose.connection.close().catch(() => {});
    });
