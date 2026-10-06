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
  shippingCod?: boolean;
  onlinePaid?: number;
  shippingLabel?: string;
  shippingEtaDays?: number;
  freeShipping?: boolean;
  paymentStatus: string;
  refId: string | null;
  status: string;
  discountAmount?: number;
  discountPercent?: number;
  couponCode?: string;
  couponFixed?: number;
};

function ResultBody() {
  const params = useSearchParams();
  const status = params.get("status") || "";
  const code = params.get("code") || "";
  const ref = params.get("ref") || "";
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [recheckMsg, setRecheckMsg] = useState("");

  // v38: بررسی دوبارهٔ پرداخت — برای حالت «retry» (قطعی درگاه هنگام بازگشت).
  const recheck = async () => {
    if (!code) return;
    setChecking(true);
    setRecheckMsg("");
    try {
      const r = await fetch(`/api/payment/recheck/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await r.json().catch(() => ({}));
      if (j.paymentStatus === "paid") {
        window.location.reload();
        return;
      }
      setRecheckMsg(j.error || "بررسی ممکن نشد. کمی بعد دوباره امتحان کنید.");
    } catch {
      setRecheckMsg("اتصال برقرار نشد. کمی بعد دوباره امتحان کنید.");
    } finally {
      setChecking(false);
    }
  };

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
  const cancelled = !paid && status === "cancelled";
  const expired = !paid && status === "expired";
  const retry = !paid && status === "retry";

  const Icon = paid ? CheckCircle2 : cancelled || expired || retry ? Clock : XCircle;
  const tone = paid ? "text-emerald-400" : cancelled || expired || retry ? "text-gold" : "text-red-400";
  const title = paid
    ? "پرداخت با موفقیت انجام شد"
    : cancelled
      ? "پرداخت لغو شد"
      : expired
        ? "مهلت پرداخت این سفارش تمام شده بود"
        : retry
          ? "وضعیت پرداخت هنوز در بررسی است"
          : "پرداخت ناموفق بود";
  const subtitle = paid
    ? "سفارش شما ثبت و پرداخت آن تأیید شد. به‌زودی با شما تماس می‌گیریم."
    : cancelled
      ? "شما پرداخت را لغو کردید و مبلغی کسر نشد. برای خرید، دوباره سفارش ثبت کنید."
      : expired
        ? "این پرداخت تأیید نشد و اگر مبلغی از حساب شما کسر شده، به‌صورت خودکار (حداکثر تا ۷۲ ساعت) برمی‌گردد. لطفاً سفارش را دوباره ثبت کنید."
        : retry
          ? "ارتباط با درگاه در لحظهٔ بازگشت شما قطع شد و پرداخت هنوز تأیید نهایی نشده. اگر مبلغی از حساب کسر شده، نگران نباشید — همان مبلغ یا تأیید و یا تا پایان روز به‌صورت خودکار عودت می‌شود. لطفاً پرداخت را دوباره انجام ندهید."
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
              {!!(info.discountAmount ?? 0) && (
                <div className="flex justify-between text-emerald-300">
                  <span>
                    {info.couponCode
                      ? info.couponFixed
                        ? `کد تخفیف ${info.couponCode} (${info.couponFixed.toLocaleString("fa-IR")} تومان)`
                        : `کد تخفیف ${info.couponCode} (${(info.discountPercent ?? 0).toLocaleString("fa-IR")}٪)`
                      : `تخفیف خرید اول (${(info.discountPercent ?? 0).toLocaleString("fa-IR")}٪)`}
                  </span>
                  <span>− {info.discountAmount!.toLocaleString("fa-IR")} تومان</span>
                </div>
              )}
              {info.shippingCod && !!info.shippingCost ? (
                <>
                  <div className="flex justify-between border-t border-gold/15 pt-2 font-bold">
                    <span className="text-gold-soft">
                      {paid ? "مبلغ پرداخت‌شدهٔ آنلاین" : "مبلغ قابل پرداخت آنلاین"}
                    </span>
                    <span className="text-gold-soft">
                      {(info.onlinePaid ?? info.total).toLocaleString("fa-IR")} تومان
                    </span>
                  </div>
                  <div className="flex justify-between text-amber-300">
                    <span>پس کرایه — هنگام تحویل</span>
                    <span>{info.shippingCost.toLocaleString("fa-IR")} تومان</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between border-t border-gold/15 pt-2 font-bold">
                  <span className="text-gold-soft">{paid ? "مبلغ پرداخت‌شده" : "مبلغ سفارش"}</span>
                  <span className="text-gold-soft">
                    {(info.onlinePaid ?? info.total).toLocaleString("fa-IR")} تومان
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {retry && (
          <div className="mt-4">
            <button
              type="button"
              onClick={recheck}
              disabled={checking}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-gold/40 py-3 text-sm font-bold text-gold-soft transition hover:bg-gold/10 disabled:opacity-50"
            >
              {checking ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
              {checking ? "در حال بررسی…" : "بررسی دوبارهٔ پرداخت"}
            </button>
            {recheckMsg && (
              <p className="mt-2 text-[11px] leading-5 text-gold-soft">{recheckMsg}</p>
            )}
          </div>
        )}

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
