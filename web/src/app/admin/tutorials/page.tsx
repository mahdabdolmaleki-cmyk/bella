"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import TutorialsAdmin from "@/components/admin/TutorialsAdmin";

export default function AdminTutorialsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  // همان محافظ مسیری که بقیهٔ صفحات ادمین دارند.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/me");
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) {
          setError("خطا در احراز هویت مدیر.");
          return;
        }
        setReady(true);
      } catch {
        setError("خطا در برقراری ارتباط با سرور.");
      }
    })();
  }, [router]);

  return (
    <AdminShell>
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !ready ? (
        <div className="flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : (
        <TutorialsAdmin />
      )}
    </AdminShell>
  );
}
