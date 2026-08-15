"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import LogsAdmin from "@/components/admin/LogsAdmin";

export default function AdminLogsPage() {
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
      ) : (
        <LogsAdmin canPurge={role === "owner"} />
      )}
    </AdminShell>
  );
}
