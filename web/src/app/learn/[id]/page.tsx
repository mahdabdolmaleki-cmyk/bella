import type { Metadata } from "next";
import TutorialClient from "./TutorialClient";
import { getSSRTutorial } from "@/lib/serverData";
import { abs, SITE_URL } from "@/lib/seo";

// SEO (v44): صفحهٔ آموزش قبلاً کاملاً کلاینتی بود — بدون متادیتا و بدون
// محتوای SSR. حالا یک صفحهٔ سرور، عنوان/توضیح/canonical/OG و JSON-LD نوع
// Article را می‌سازد و کامپوننت تعاملی را کلاینت رندر می‌کند.
const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

export const revalidate = 60;

type TutMeta = {
  id?: number;
  title?: string;
  excerpt?: string;
  createdAt?: string;
  updatedAt?: string;
};

async function getTutorial(id: number): Promise<TutMeta | null> {
  try {
    const res = await fetch(`${API_BASE}/api/tutorials/${id}`, {
      next: { revalidate: 60 },
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.tutorial ?? null) as TutMeta | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTutorial(Number(id));
  const path = `/learn/${id}`;
  if (!t?.title) {
    return { title: "آموزش پیدا نشد", robots: { index: false, follow: true } };
  }
  const title = `آموزش ${t.title}`;
  const description = (t.excerpt || t.title).slice(0, 155);
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
      type: "article",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTutorial(Number(id));
  // SSR: متن کامل آموزش به کلاینت پاس می‌شود و در HTML اولیه رندر می‌شود.
  const full = await getSSRTutorial(Number(id));
  const ld = t?.title
    ? {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Article",
            headline: t.title,
            description: t.excerpt || t.title,
            inLanguage: "fa",
            datePublished: t.createdAt,
            dateModified: t.updatedAt ?? t.createdAt,
            mainEntityOfPage: abs(`/learn/${id}`),
            author: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "بلا پرفیوم" },
            publisher: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "بلا پرفیوم" },
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "خانه", item: abs("/") },
              { "@type": "ListItem", position: 2, name: "آموزش", item: abs("/learn") },
              { "@type": "ListItem", position: 3, name: t.title, item: abs(`/learn/${id}`) },
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
      <TutorialClient initial={full} />
    </>
  );
}
