"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import ProductsAdmin from "@/components/admin/ProductsAdmin";
import { parseShopCategories } from "@/lib/settings";
import type { Product } from "@/lib/types";

export default function AdminProductsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Product[] | null>(null);
  // دسته‌بندی‌های فروشگاه را هم‌زمان می‌گیریم تا فرم افزودن محصول دقیقاً
  // همان دسته‌هایی را نشان دهد که ادمین در تنظیمات ساخته است.
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/products");
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) {
          setError("خطا در دریافت محصولات.");
          return;
        }
        const data = await res.json();
        setRows(data.products ?? []);

        // دسته‌بندی‌های پویا از تنظیمات. اگر خواندنش شکست خورد، فرم به
        // دسته‌های پیش‌فرض برمی‌گردد.
        try {
          const sres = await fetch("/api/admin/settings");
          if (sres.ok) {
            const sdata = await sres.json();
            setCategories(parseShopCategories(sdata.settings?.shopCategories));
          }
        } catch {
          /* بی‌خیال — پیش‌فرض‌ها استفاده می‌شوند. */
        }
      } catch {
        setError("خطا در برقراری ارتباط با سرور.");
      }
    })();
  }, [router]);

  return (
    <AdminShell>
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !rows ? (
        <div className="flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : (
        <ProductsAdmin initialProducts={rows} categories={categories} />
      )}
    </AdminShell>
  );
}
