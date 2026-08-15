"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the details in the console only — never render a stack trace to the
    // user, it leaks file paths and library versions.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-black text-cream">مشکلی پیش آمد</h1>
      <p className="max-w-sm text-sm leading-7 text-sage">
        متأسفانه این بخش بارگذاری نشد. دوباره تلاش کنید یا اگر ادامه داشت با پشتیبانی تماس بگیرید.
      </p>
      <button
        onClick={reset}
        className="rounded-full border border-gold/40 bg-gold/10 px-6 py-2.5 text-sm font-bold text-gold transition-colors hover:bg-gold/20"
      >
        تلاش مجدد
      </button>
    </div>
  );
}
