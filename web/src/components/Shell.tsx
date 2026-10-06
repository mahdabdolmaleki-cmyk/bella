"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Header, BottomNav, Footer } from "./Chrome";
import { CartProvider, CartDrawer, Toast } from "./Cart";
import { AuthProvider } from "./AuthContext";
import { GoldDust } from "./art";
import VisitTracker from "./VisitTracker";
import PwaRegister from "./PwaRegister";
import BellaConsultation from "./BellaConsultation";

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

  /* پاپ‌آپ مشاوره: آیکن چت هدر با یک رویداد سراسری بازش می‌کند
     (تا هدر و بدنه به هم گره نخورند). Esc و کلیک بیرون می‌بندد. */
  const [consult, setConsult] = useState(false);
  useEffect(() => {
    const open = () => setConsult(true);
    window.addEventListener("bella:open-consult", open);
    return () => window.removeEventListener("bella:open-consult", open);
  }, []);
  useEffect(() => {
    if (!consult) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConsult(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [consult]);

  // The admin panel has its own layout — skip the storefront chrome there.
  if (pathname?.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      <CartProvider>
        <div className="grain relative flex min-h-screen flex-col">
          <GoldDust count={14} />
          <VisitTracker />
          <PwaRegister />
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
          <AnimatePresence>
            {consult && (
              <motion.div
                key="consult-veil"
                className="consult-veil"
                role="dialog"
                aria-modal="true"
                aria-label="مشاوره عطر بلا"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setConsult(false);
                }}
              >
                <motion.div
                  className="consult-pop"
                  initial={{ opacity: 0, y: 30, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 22, scale: 0.99 }}
                  transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                >
                  <button
                    type="button"
                    className="consult-close"
                    onClick={() => setConsult(false)}
                    aria-label="بستن"
                  >
                    <X size={18} />
                  </button>
                  <BellaConsultation inPopup />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CartProvider>
    </AuthProvider>
  );
}
