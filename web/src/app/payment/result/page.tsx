"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

type PaymentInfo = {
  code: string;
  total: number;
  subtotal?: number;
  shippingCost?: number;
  shippingLabel?: string;
  shippingEtaDays?: number;
  freeShipping?: boolean;
  paymentStatus: string;
  refId: string | null;
  status: string;
};

function ResultBody() {
  const params = useSearchParams();
  const status = params.get("status") || "";
  const code = params.get("code") || "";
  const ref = params.get("ref") || "";
  const [info, setInfo] = useState<PaymentInfo | null>(null);

  useEffect(() => {
    if (!code) return;
    (async () => {
      try {
        const res = await fetch(`/api/payment/status/${encodeURIComponent(code)}`);
        if (res.ok) setInfo(await res.json());
      } catch {
        /* the query string is enough to show a result */
      }
    })();
  }, [code]);

  const paid = status === "ok" || info?.paymentStatus === "paid";
  const cancelled = status === "cancelled";

  const Icon = paid ? CheckCircle2 : cancelled ? Clock : XCircle;
  const tone = paid ? "text-emerald-400" : cancelled ? "text-gold" : "text-red-400";
  const title = paid
    ? "پرداخت با موفقیت انجام شد"
    : cancelled
      ? "پرداخت لغو شد"
      : "پرداخت ناموفق بود";
  const subtitle = paid
    ? "سفارش شما ثبت و پرداخت آن تأیید شد. به‌زودی با شما تماس می‌گیریم."
    : cancelled
      ? "شما پرداخت را نیمه‌کاره رها کردید. سفارش شما پرداخت‌نشده باقی مانده است."
      : "مبلغی از حساب شما کسر نشده است. اگر کسر شد، تا ۷۲ ساعت به‌صورت خودکار برمی‌گردد.";

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#08130d] px-5 text-cream">
      <div className="gold-ring w-full max-w-md rounded-3xl border border-gold/25 bg-night p-8 text-center">
        <Icon size={56} className={`mx-auto ${tone}`} />
        <h1 className="mt-4 text-xl font-black">{title}</h1>
        <p className="mt-2 text-xs leading-6 text-sage">{subtitle}</p>

        <div className="mt-6 space-y-2 rounded-2xl glass-panel p-4 text-right text-xs">
          {code && (
            <div className="flex justify-between">
              <span className="text-sage">کد سفارش</span>
              <span className="font-mono text-cream">{code}</span>
            </div>
          )}
          {(ref || info?.refId) && (
            <div className="flex justify-between">
              <span className="text-sage">کد رهگیری بانک</span>
              <span className="font-mono text-gold-soft">{ref || info?.refId}</span>
            </div>
          )}
          {info && (
            <>
              <div className="flex justify-between">
                <span className="text-sage">جمع کالاها</span>
                <span className="text-cream">
                  {(info.subtotal ?? info.total - (info.shippingCost ?? 0)).toLocaleString("fa-IR")} تومان
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sage">
                  هزینه ارسال{info.shippingLabel ? ` (${info.shippingLabel})` : ""}
                </span>
                <span className={info.freeShipping ? "text-gold-soft" : "text-cream"}>
                  {info.freeShipping || !info.shippingCost
                    ? "رایگان"
                    : `${info.shippingCost.toLocaleString("fa-IR")} تومان`}
                </span>
              </div>
              {!!info.shippingEtaDays && (
                <div className="flex justify-between">
                  <span className="text-sage">زمان تحویل</span>
                  <span className="text-cream">
                    تا {info.shippingEtaDays.toLocaleString("fa-IR")} روز کاری
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-gold/15 pt-2 font-bold">
                <span className="text-gold-soft">مبلغ پرداختی</span>
                <span className="text-gold-soft">{info.total.toLocaleString("fa-IR")} تومان</span>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/account"
            className="shimmer-btn rounded-full py-3 text-sm font-bold text-[#241a05]"
          >
            مشاهده سفارش‌های من
          </Link>
          <Link href="/shop" className="rounded-full border border-gold/30 py-3 text-xs font-bold text-gold-soft">
            بازگشت به فروشگاه
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#08130d] text-sage">
          <Loader2 size={20} className="animate-spin" />
        </div>
      }
    >
      <ResultBody />
    </Suspense>
  );
}
