import type { MetadataRoute } from "next";
import { abs } from "@/lib/seo";

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

// صفحات استاتیک اصلی.
const STATIC: Array<{ path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1, freq: "daily" },
  { path: "/shop", priority: 0.9, freq: "daily" },
  { path: "/learn", priority: 0.6, freq: "weekly" },
  { path: "/packaging", priority: 0.5, freq: "monthly" },
  { path: "/contact", priority: 0.5, freq: "monthly" },
  { path: "/terms", priority: 0.3, freq: "yearly" },
];

export const revalidate = 3600; // بازسازی نقشه هر ساعت

const iso = (v?: string | null, fallback: Date = new Date()) => {
  const d = v ? new Date(v) : fallback;
  return Number.isNaN(d.getTime()) ? fallback : d;
};

/**
 * نقشهٔ کامل سایت برای گوگل: صفحات استاتیک + تک‌تک محصولات فعال (با
 * lastmod واقعی و عکس محصول) + همهٔ آموزش‌های منتشرشده.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC.map((s) => ({
    url: abs(s.path),
    lastModified: now,
    changeFrequency: s.freq,
    priority: s.priority,
  }));

  const [products, tutorials] = await Promise.allSettled([
    fetch(`${API_BASE}/api/products?limit=500`, {
      next: { revalidate: 3600 },
      cache: "force-cache",
    }).then((r) => (r.ok ? r.json() : null)),
    fetch(`${API_BASE}/api/tutorials?limit=48`, {
      next: { revalidate: 3600 },
      cache: "force-cache",
    }).then((r) => (r.ok ? r.json() : null)),
  ]);

  // محصولات فعال → مهم‌ترین بخش سئوی فروشگاهی.
  if (products.status === "fulfilled" && products.value) {
    const list = Array.isArray(products.value?.products) ? products.value.products : [];
    for (const p of list) {
      if (p?.id != null && p.active !== false) {
        entries.push({
          url: abs(`/shop/${p.id}`),
          lastModified: iso(p.updatedAt ?? p.createdAt, now),
          changeFrequency: "weekly",
          priority: 0.8,
          ...(p.image ? { images: [abs(p.image)] } : {}),
        });
      }
    }
  }

  // آموزش‌های منتشرشده → محتوای ارگانیکِ بلاگ‌مانند.
  if (tutorials.status === "fulfilled" && tutorials.value) {
    const list = Array.isArray(tutorials.value?.tutorials) ? tutorials.value.tutorials : [];
    for (const t of list) {
      if (t?.id != null) {
        entries.push({
          url: abs(`/learn/${t.id}`),
          lastModified: iso(t.updatedAt ?? t.createdAt, now),
          changeFrequency: "monthly",
          priority: 0.6,
        });
      }
    }
  }

  return entries;
}
