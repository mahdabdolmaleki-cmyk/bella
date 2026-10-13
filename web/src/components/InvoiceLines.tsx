import { formatToman } from "@/lib/data";

// ──────────────────────────────────────────────────────────────────────────
// ردیف‌های فاکتور — نسخهٔ مشترک (v41)
//
// یکی‌سازی کامل فاکتور در «همهٔ جاها»: صفحهٔ سفارش‌های من (دارک)، پنل
// مدیریت سفارشات (دارک) و «فاکتورها»ی کاربران ادمین (کرم). قوانین:
//  • تخفیف (کد درصدی/مبلغی یا خرید اول) همیشه در یک ردیف مشخص نوشته می‌شود.
//  • سفارش پس‌کرایه: ردیف «مبلغ کل/هزینه سفارش» نمایش داده نمی‌شود؛
//    بجایش «مبلغ قابل پرداخت آنلاین» + «پس کرایه — هنگام تحویل» می‌آید.
//  • کد تخفیف مبلغی: «کد تخفیف CODE (N تومان)»؛ درصدی: «(N٪)».
// ──────────────────────────────────────────────────────────────────────────

export type StarPerkApplied = { key: string; star?: number; title?: string };

export type InvoiceOrderLite = {
  subtotal?: number;
  total: number;
  shippingCost?: number;
  shippingCod?: boolean;
  freeShipping?: boolean;
  discountAmount?: number;
  discountPercent?: number;
  discountFixed?: number;
  couponCode?: string;
  couponPercent?: number;
  couponFixed?: number;
  vipBox?: boolean;
  vipBoxFee?: number;
  onlinePaid?: number;
  // وفاداری ستاره‌ای — برای نمایشِ «کدام مزیت از کدام ستاره» در فاکتور.
  starLevel?: number;
  starGift?: boolean;
  starPerksApplied?: StarPerkApplied[];
  discountSource?: "none" | "first" | "coupon" | "star" | string;
};

const fa = (n: number) => n.toLocaleString("fa-IR");

export function InvoiceLines({
  order,
  tone = "light",
  totalLabel,
}: {
  order: InvoiceOrderLite;
  tone?: "light" | "dark";
  totalLabel?: string;
}) {
  const shippingCost = order.shippingCost ?? 0;
  const subtotal = order.subtotal ?? Math.max(0, order.total - shippingCost);
  const discountAmount = order.discountAmount ?? 0;
  const discountPercent = order.discountPercent ?? 0;
  const vipBoxFee = order.vipBoxFee ?? 0;
  const cod = Boolean(order.shippingCod);
  const online = order.onlinePaid ?? Math.max(0, order.total - (cod ? shippingCost : 0));
  const fixedValue = order.discountFixed ?? (order.couponCode ? order.couponFixed ?? 0 : 0);
  const discountDescriptor =
    fixedValue > 0 && !discountPercent
      ? ` (${fa(fixedValue)} تومان)`
      : discountPercent > 0
        ? ` (${fa(discountPercent)}٪)`
        : "";

  // مزایای ستارهٔ اعمال‌شده و منبع هرکدام (عنوان ستاره) — برای فاکتور.
  const perks = order.starPerksApplied ?? [];
  const perkTitle = (key: string) => perks.find((p) => p.key === key)?.title || "";
  const freeshipStar = perkTitle("freeship");
  const vipboxStar = perkTitle("vipbox");
  const discountStar = perkTitle("discount");
  const giftStar = perkTitle("gift");
  // قلمِ هدیهٔ انتخابیِ مشتری (price=0) تا نامش در فاکتور بیاید.
  const giftItem = (
    (order as { items?: { gift?: boolean; name?: string }[] }).items || []
  ).find((it) => it.gift);
  const vipFromStar = Boolean(vipboxStar) && order.vipBox === true && vipBoxFee === 0;
  const shipFromStar = Boolean(freeshipStar) && (order.freeShipping || shippingCost === 0);
  const discountFromStar = order.discountSource === "star" && discountAmount > 0;

  const light = tone === "light";
  const k = light
    ? {
        box: "space-y-1.5 rounded-xl border border-[#d4af7c]/35 bg-[#efe6d8] px-3 py-2.5 text-xs",
        row: "text-[#3d2f38]",
        val: "font-bold text-[#241a22]",
        disc: "text-[#4e1e39]",
        sep: "border-t border-[#d4af7c]/40 pt-1.5",
        strong: "font-black text-[#4e1e39]",
        codVal: "font-bold text-[#4e1e39]",
      }
    : {
        box: "space-y-1.5 text-xs",
        row: "text-sage",
        val: "text-cream",
        disc: "text-emerald-300",
        sep: "border-t border-gold/10 pt-1.5",
        strong: "font-bold text-gold-soft",
        codVal: "text-amber-300",
      };

  const Row = ({
    label,
    value,
    cls,
    valueCls,
    border,
  }: {
    label: React.ReactNode;
    value: React.ReactNode;
    cls?: string;
    valueCls?: string;
    border?: boolean;
  }) => (
    <div className={`flex justify-between ${cls ?? k.row} ${border ? k.sep : ""}`}>
      <span>{label}</span>
      <span className={valueCls ?? k.val}>{value}</span>
    </div>
  );

  return (
    <div className={k.box}>
      <Row label="جمع کالاها" value={formatToman(subtotal)} />
      {discountAmount > 0 && (
        <Row
          cls={k.disc}
          valueCls={light ? "font-bold" : undefined}
          label={
            discountFromStar
              ? `تخفیف وفاداری — از مزایای ${discountStar}${discountDescriptor}`
              : order.couponCode
                ? `کد تخفیف ${order.couponCode}${discountDescriptor}`
                : `تخفیف خرید اول${discountDescriptor}`
          }
          value={`− ${formatToman(discountAmount)}`}
        />
      )}
      {vipFromStar ? (
        <Row
          cls={k.disc}
          valueCls={light ? "font-bold" : undefined}
          label={`باکس ویژه VIP — رایگان (از مزایای ${vipboxStar})`}
          value="رایگان"
        />
      ) : (
        vipBoxFee > 0 && <Row label="باکس ویژه" value={formatToman(vipBoxFee)} />
      )}
      {!cod && (
        <Row
          cls={shipFromStar ? k.disc : undefined}
          valueCls={shipFromStar && light ? "font-bold" : undefined}
          label="هزینه ارسال"
          value={
            shipFromStar
              ? `رایگان — از مزایای ${freeshipStar}`
              : order.freeShipping || shippingCost === 0
                ? "رایگان"
                : formatToman(shippingCost)
          }
        />
      )}
      {giftStar && (
        <Row
          cls={k.disc}
          valueCls={light ? "font-bold" : undefined}
          label={`هدیهٔ وفاداری${giftItem?.name ? `: ${giftItem.name}` : ""} — از مزایای ${giftStar}`}
          value="رایگان"
        />
      )}
      {cod ? (
        <>
          <Row
            border
            cls={k.strong}
            valueCls={light ? "font-black text-[#241a22]" : "text-cream"}
            label="مبلغ قابل پرداخت آنلاین"
            value={formatToman(online)}
          />
          <Row
            cls={light ? k.row : k.row}
            valueCls={k.codVal}
            label="پس کرایه — هنگام تحویل"
            value={formatToman(shippingCost)}
          />
        </>
      ) : (
        <Row
          border
          cls={k.strong}
          valueCls={k.strong}
          label={totalLabel ?? "مبلغ کل فاکتور"}
          value={formatToman(order.total)}
        />
      )}
    </div>
  );
}

// ── v42: دلیل شکست پرداخت ─────────────────────────────────────────────
// sweeper سفارش‌های بی‌پرداختِ قدیمی را «failed» می‌کند (انقضا) و درگاه هم
// «failed» می‌زند (رد/لغو). برای اینکه «ناموفق» گمراه‌کننده نباشد، اینجا
// دلیلِ ذخیره‌شده (paymentFailReason) به برچسب و توضیح تبدیل می‌شود.
export function paymentFailInfo(order: {
  paymentStatus?: string;
  paymentFailReason?: string;
}): { label: string; note: string } | null {
  if (order.paymentStatus !== "failed") return null;
  switch (order.paymentFailReason) {
    case "expired":
      return {
        label: "منقضی — پرداخت انجام نشد",
        note: "پرداخت آنلاین در مهلت مجاز (پیش‌فرض ۳۰ دقیقه) تکمیل نشد؛ سفارش خودکار منقضی و موجودی آزاد شد.",
      };
    case "declined":
      return {
        label: "پرداخت رد شد",
        note: "درگاه بانکی پرداخت را تأیید نکرد؛ اگر مبلغی کسر شده باشد تا پایان روز خودکار عودت می‌شود.",
      };
    case "canceled":
      return {
        label: "پرداخت لغو شد",
        note: "پرداخت در صفحهٔ بانک لغو شد؛ می‌توانید دوباره پرداخت کنید (با سفارش جدید).",
      };
    default:
      return {
        label: "پرداخت ناموفق",
        note: "پرداخت این سفارش تکمیل نشد.",
      };
  }
}
