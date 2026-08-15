"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CrestImg } from "@/components/art";

// صفحهٔ ورود جداگانهٔ مدیر حذف شد. اکنون ورود مدیر هم از همان صفحهٔ حساب
// کاربری (/account) انجام می‌شود: مدیر اصلی با شمارهٔ هاردکدشده و کد
// یک‌بارمصرف وارد می‌شود و به صورت خودکار به /admin هدایت می‌شود. این مسیر
// فقط برای سازگاری با لینک‌های قدیمی می‌ماند و کاربر را به /account می‌فرستد.
export default function AdminLoginRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/account");
  }, [router]);

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#08130d] px-5 text-cream">
      <div className="gold-ring w-full max-w-sm rounded-3xl border border-gold/25 bg-night p-8 text-center">
        <CrestImg className="mx-auto w-16" />
        <h1 className="font-brand mt-2 text-3xl text-gold">Bella Perfume</h1>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-sage">
          <Loader2 size={14} className="animate-spin" />
          ورود مدیر اکنون از صفحهٔ حساب کاربری انجام می‌شود…
        </p>
      </div>
    </div>
  );
}
