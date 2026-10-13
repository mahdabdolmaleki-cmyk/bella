import type { Metadata } from "next";
import ProductClient from "./ProductClient";
import { abs } from "@/lib/seo";
import { getSSRProduct } from "@/lib/serverData";

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
  const title = p.name.startsWith("عطر") ? `خرید ${p.name}` : `خرید عطر ${p.name}`;
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

// SEO: دادهٔ ساختاریافتهٔ Product + BreadcrumbList تا گوگل قیمت، موجودی و
// مسیر صفحه را بفهمد (ریچ‌اسنیپت محصول در نتایج جست‌وجو).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProduct(Number(id));
  // SSR: محصول کامل به کلاینت پاس می‌شود تا در HTML اولیه رندر شود.
  const initial = await getSSRProduct(Number(id));
  const ld = p?.name
    ? {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Product",
            name: p.name,
            description: (p.description || `عطر ${p.name} از بلا پرفیوم`).slice(0, 500),
            ...(p.image ? { image: abs(p.image) } : {}),
            brand: { "@type": "Brand", name: p.category || "بلا پرفیوم" },
            offers: {
              "@type": "Offer",
              price: p.price ?? 0,
              priceCurrency: "IRR",
              availability: "https://schema.org/InStock",
              url: abs(`/shop/${id}`),
            },
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "خانه", item: abs("/") },
              { "@type": "ListItem", position: 2, name: "فروشگاه", item: abs("/shop") },
              { "@type": "ListItem", position: 3, name: p.name, item: abs(`/shop/${id}`) },
            ],
          },
        ],
      }
    : null;
  return (
    <>
      {ld && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        />
      )}
      <ProductClient initial={initial} />
    </>
  );
}
