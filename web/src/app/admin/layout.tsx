import type { Metadata } from "next";
import type { ReactNode } from "react";

// SEO: پنل ادمین محتوای خصوصی است و هرگز نباید در نتایج گوگل بیاید.
// Disallow در robots.txt خزش را می‌بندد، ولی meta noindex تضمین می‌کند
// حتی از طریق لینک‌های بیرونی هم ایندکس نشود.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
