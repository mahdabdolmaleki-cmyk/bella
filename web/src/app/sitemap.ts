import type { MetadataRoute } from "next";
import { abs } from "@/lib/seo";

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

// صفحات استاتیک اصلی.
const STATIC: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/shop", priority: 0.9 },
  { path: "/learn", priority: 0.6 },
  { path: "/packaging", priority: 0.5 },
  { path: "/contact", priority: 0.5 },
  { path: "/terms", priority: 0.3 },
];

export const revalidate = 3600; // بازسازی نقشه هر ساعت

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC.map((s) => ({
    url: abs(s.path),
    lastModified: now,
    changeFrequency: s.path === "/" ? "daily" : "weekly",
    priority: s.priority,
  }));

  // محصولات فعال → صفحهٔ تکی هر محصول (مهم‌ترین بخش سئوی فروشگاهی).
  try {
    const res = await fetch(`${API_BASE}/api/products?limit=500`, {
      next: { revalidate: 3600 },
      cache: "force-cache",
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data?.products) ? data.products : [];
      for (const p of list) {
        if (p?.id != null && p.active !== false) {
          entries.push({
            url: abs(`/shop/${p.id}`),
            lastModified: now,
            changeFrequency: "weekly",
            priority: 0.8,
          });
        }
      }
    }
  } catch {
    /* در دسترس‌نبودن API، فقط صفحات استاتیک در نقشه می‌مانند */
  }

  return entries;
}
