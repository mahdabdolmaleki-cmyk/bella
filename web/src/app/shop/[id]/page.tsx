import type { Metadata } from "next";
import ProductClient from "./ProductClient";
import { abs } from "@/lib/seo";

// پایهٔ داخلی بک‌اند (همان الگوی lib/settings.ts) برای واکشی متادیتا در سرور.
const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

export const revalidate = 60;

type ProductMeta = {
  name?: string;
  nameEn?: string;
  description?: string;
  category?: string;
  price?: number;
  image?: string;
};

async function getProduct(id: number): Promise<ProductMeta | null> {
  try {
    const res = await fetch(`${API_BASE}/api/products/${id}`, {
      next: { revalidate: 60 },
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.product ?? data) as ProductMeta;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await getProduct(Number(id));
  const path = `/shop/${id}`;
  if (!p || !p.name) {
    return { title: "محصول پیدا نشد", robots: { index: false, follow: true } };
  }
  const title = `خرید عطر ${p.name}`;
  const description = (
    (typeof p.description === "string" && p.description) ||
    `عطر ${p.name} از بلا پرفیوم — عطر اورینتال با بسته‌بندی لوکس و ضمانت اصالت.`
  ).slice(0, 155);

  return {
    title,
    description,
    alternates: { canonical: abs(path) },
    openGraph: {
      url: abs(path),
      title,
      description,
      locale: "fa_IR",
      siteName: "بلا پرفیوم",
      type: "website",
      ...(p.image ? { images: [abs(p.image)] } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page() {
  return <ProductClient />;
}
