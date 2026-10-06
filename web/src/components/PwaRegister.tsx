"use client";
import { useEffect } from "react";

/**
 * Service Worker را ثبت می‌کند (لازمهٔ «قابل نصب بودن» سایت و ساخت اپ اندروید).
 * فقط در نسخهٔ production و بعد از بارگذاری کامل صفحه اجرا می‌شود تا سرعت
 * باز شدن سایت هیچ تغییری نکند. هر خطایی بی‌صدا نادیده گرفته می‌شود.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
