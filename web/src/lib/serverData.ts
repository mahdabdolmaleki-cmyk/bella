// SSR (v45): واکشی دادهٔ صفحات در «سمت سرور» تا محتوای اصلی (محصول‌ها،
// آموزش‌ها، جزئیات) داخل HTML اولیه باشد — هم برای گوگل (بدون JS هم محتوا
// دیده می‌شود) و هم برای اولین paint کاربر (بدون اسکلتون/پرش).
// این ماژول فقط از کامپوننت‌های سرور ایمپورت می‌شود.
import type { ProductDTO } from "./data";
import type { TutorialCard, TutorialDTO } from "./tutorials";

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

/** تازگی محتوای SSR — همان ۶۰ ثانیهٔ بقیهٔ سایت. */
export const SSR_REVALIDATE = 60;

async function getJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      next: { revalidate: SSR_REVALIDATE },
      cache: "force-cache",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** فهرست محصولات با همان پارام‌های پیش‌فرضی که کلاینت می‌فرستد. */
export async function getSSRProducts(qs = ""): Promise<ProductDTO[] | null> {
  const d = await getJSON<{ products?: ProductDTO[] }>(
    `/api/products${qs ? `?${qs}` : ""}`,
  );
  return Array.isArray(d?.products) ? d.products : null;
}

export async function getSSRProduct(id: number): Promise<ProductDTO | null> {
  const d = await getJSON<{ product?: ProductDTO }>(`/api/products/${id}`);
  return d?.product ?? null;
}

export async function getSSRTutorials(qs = ""): Promise<{
  tutorials: TutorialCard[] | null;
  categories: string[] | null;
}> {
  const d = await getJSON<{ tutorials?: TutorialCard[]; categories?: string[] }>(
    `/api/tutorials${qs ? `?${qs}` : ""}`,
  );
  return {
    tutorials: Array.isArray(d?.tutorials) ? d.tutorials : null,
    categories: Array.isArray(d?.categories) ? d.categories : null,
  };
}

export async function getSSRTutorial(id: number): Promise<TutorialDTO | null> {
  const d = await getJSON<{ tutorial?: TutorialDTO }>(`/api/tutorials/${id}`);
  return d?.tutorial ?? null;
}
