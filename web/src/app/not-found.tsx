import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-display text-6xl text-gold/70">۴۰۴</p>
      <h1 className="text-2xl font-black text-cream">این صفحه پیدا نشد</h1>
      <p className="max-w-sm text-sm leading-7 text-sage">
        شاید نشانی را اشتباه وارد کرده‌اید یا این محصول حالا در دسترس نیست.
      </p>
      <Link
        href="/"
        className="rounded-full border border-gold/40 bg-gold/10 px-6 py-2.5 text-sm font-bold text-gold transition-colors hover:bg-gold/20"
      >
        بازگشت به خانه
      </Link>
    </div>
  );
}
