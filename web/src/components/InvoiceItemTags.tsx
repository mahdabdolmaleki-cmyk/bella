import { formatToman } from "@/lib/data";

/**
 * برچسب کمپینِ یک قلم فاکتور (جشنواره / تخفیف) + مبلغ تخفیف همان قلم.
 *
 * این اطلاعات هنگام خرید روی آیتم سفارش «snapshot» می‌شود (oldPrice/festival/
 * discount) تا حتی اگر محصول بعداً از کمپین خارج شد، فاکتورهای مشتری و ادمین
 * همچنان درست نمایش دهند.
 */
export type InvoiceItemLite = {
  price: number;
  qty: number;
  oldPrice?: number | null;
  festival?: boolean;
  discount?: boolean;
};

export function ItemCampaignTags({
  item,
  tone = "dark",
}: {
  item: InvoiceItemLite;
  tone?: "light" | "dark";
}) {
  const lineDiscount =
    item.oldPrice != null && item.oldPrice > item.price
      ? (item.oldPrice - item.price) * item.qty
      : 0;
  const hasTag = item.festival || item.discount;
  if (!hasTag && lineDiscount <= 0) return null;

  const badge =
    tone === "light"
      ? "rounded-full border border-[#d4af7c]/40 bg-[#e7dcc6] px-1.5 py-0.5 text-[9px] font-black text-[#4e1e39]"
      : "rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[9px] font-black text-gold-soft";
  const fest =
    tone === "light"
      ? "rounded-full border border-rose-300/50 bg-rose-300/10 px-1.5 py-0.5 text-[9px] font-black text-rose-600"
      : "rounded-full border border-rose-300/40 bg-rose-300/10 px-1.5 py-0.5 text-[9px] font-black text-rose-300";
  const disc =
    tone === "light"
      ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black text-emerald-700"
      : "rounded-full border border-emerald-300/40 bg-emerald-300/10 px-1.5 py-0.5 text-[9px] font-black text-emerald-300";
  const meta =
    tone === "light" ? "text-[9px] text-[#3d2f38]/70" : "text-[9px] text-sage/70";

  const hasOld = item.oldPrice != null && item.oldPrice > item.price;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {item.festival && <span className={fest}>جشنواره</span>}
      {item.discount && <span className={disc}>تخفیف</span>}
      {hasOld && (
        <span className={meta}>
          قیمت اصلی: <s>{formatToman(item.oldPrice!)}</s>
        </span>
      )}
      {lineDiscount > 0 && (
        <span className={badge}>تخفیف: −{formatToman(lineDiscount)}</span>
      )}
    </span>
  );
}
