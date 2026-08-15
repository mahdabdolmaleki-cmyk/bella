"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import BackupAdmin from "@/components/admin/BackupAdmin";

export default function AdminBackupPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
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
        const data = await res.json();
        setRole(data.role ?? "owner");
      } catch {
        setError("خطا در برقراری ارتباط با سرور.");
      }
    })();
  }, [router]);

  return (
    <AdminShell>
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !role ? (
        <div className="flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : role !== "owner" ? (
        // The server rejects non-owners anyway; this only avoids showing a
        // screen the account can never use.
        <div className="flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-xs text-red-300">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <p>
            پشتیبان‌گیری از پایگاه داده فقط در دسترس مالک فروشگاه است.
          </p>
        </div>
      ) : (
        <BackupAdmin />
      )}
    </AdminShell>
  );
}
