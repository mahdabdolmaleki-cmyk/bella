import type { Metadata } from "next";
import type { ReactNode } from "react";

// SEO: حساب کاربری محتوای خصوصی هر مشتری است؛ هرگز ایندکس نشود.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
