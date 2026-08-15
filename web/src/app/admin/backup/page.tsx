"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import BackupAdmin from "@/components/admin/BackupAdmin";

export default function AdminBackupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/me");
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) {
          setError("خطا در دریافت اطلاعات حساب.");
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
        <BackupAdmin />
      )}
    </AdminShell>
  );
}
