"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import SettingsAdmin from "@/components/admin/SettingsAdmin";
import type { SiteSettingsMap } from "@/lib/settings";

export default function AdminSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SiteSettingsMap | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) {
          setError("خطا در دریافت تنظیمات.");
          return;
        }
        const data = await res.json();
        setSettings(data.settings);
      } catch {
        setError("خطا در برقراری ارتباط با سرور.");
      }
    })();
  }, [router]);

  return (
    <AdminShell>
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !settings ? (
        <div className="flex items-center gap-2 text-sage">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری…
        </div>
      ) : (
        <SettingsAdmin initialSettings={settings} />
      )}
    </AdminShell>
  );
}
