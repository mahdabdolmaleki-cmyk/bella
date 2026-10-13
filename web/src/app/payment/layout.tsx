import type { Metadata } from "next";
import type { ReactNode } from "react";

// SEO: صفحات پرداخت تراکنشی‌اند و هیچ ارزش جست‌وجویی ندارند؛
// ایندکس‌شدن‌شان فقط بودجهٔ خزش صفحات مهم را می‌سوزاند.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PaymentLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
