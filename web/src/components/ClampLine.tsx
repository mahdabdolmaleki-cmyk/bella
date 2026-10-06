"use client";
import { useEffect, useRef, useState } from "react";

/**
 * متنِ طولانی را در «یک خط» نشان می‌دهد (با …) و اگر جا کم آمد، دکمهٔ
 * کوچک «بیشتر» کنارش می‌نشیند؛ با کلیک، متن به دو خط باز می‌شود و با
 * «کمتر» دوباره جمع می‌شود.
 *
 * کاربرد: ردیف‌های نت رایحه (آغاز/قلب/پایه) در کارت محصولات فروشگاه و
 * صفحهٔ محصول — به‌جای آن‌که از ابتدا دوخطی و شلوغ دیده شوند.
 */
export default function ClampLine({
  text,
  className = "",
  moreLabel = "بیشتر",
  lessLabel = "کمتر",
}: {
  text: string;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // در حالت بازشده اندازه‌گیری معنا ندارد (متن دیده می‌شود)؛ فقط در
    // حالت جمع‌شده سرریز را می‌سنجیم تا دکمهٔ «کمتر» ناپدید نشود.
    const measure = () => {
      if (expanded) return;
      setOverflows(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, expanded]);

  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span
        ref={ref}
        title={text}
        className={`min-w-0 ${expanded ? "line-clamp-2" : "truncate"} ${className}`}
      >
        {text}
      </span>
      {overflows && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="shrink-0 cursor-pointer text-[10px] font-bold text-gold transition-colors hover:text-gold-soft"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </span>
  );
}
