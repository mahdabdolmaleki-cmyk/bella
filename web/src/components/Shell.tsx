"use client";
import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Header, BottomNav, Footer } from "./Chrome";
import { CartProvider, CartDrawer, Toast } from "./Cart";
import { AuthProvider } from "./AuthContext";
import { GoldDust } from "./art";
import VisitTracker from "./VisitTracker";

export default function Shell({
  children,
  footerAbout,
  footerBadges,
  footerGuaranteeTitle,
  footerGuarantees,
}: {
  children: ReactNode;
  footerAbout?: string;
  footerBadges?: string;
  /** v33: ستون ضمانت‌های فوتر از تنظیمات می‌آید. */
  footerGuaranteeTitle?: string;
  footerGuarantees?: string;
}) {
  const pathname = usePathname();

  // The admin panel has its own layout — skip the storefront chrome there.
  if (pathname?.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      <CartProvider>
        <div className="grain relative flex min-h-screen flex-col bg-night">
          <GoldDust count={14} />
          <VisitTracker />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer
            aboutText={footerAbout}
            badges={footerBadges}
            guaranteeTitle={footerGuaranteeTitle}
            guarantees={footerGuarantees}
          />
          <BottomNav />
          <CartDrawer />
          <Toast />
        </div>
      </CartProvider>
    </AuthProvider>
  );
}
