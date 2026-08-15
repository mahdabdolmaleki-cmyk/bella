"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/* ==================================================================== */
/*  Fire-and-forget page-view counter feeding the admin "بازدید" chart.  */
/*  It only sends a coarse bucket name (never the full URL or any user   */
/*  identifier), and every failure is silently ignored so a tracking     */
/*  hiccup can never break a page render.                               */
/* ==================================================================== */

function bucketFor(pathname: string) {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/shop/")) return "product";
  if (pathname.startsWith("/shop")) return "shop";
  if (pathname.startsWith("/account")) return "account";
  return "other";
}

export default function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;

    const bucket = bucketFor(pathname);
    // For product pages we also pass the numeric id so per-product views can
    // be reported later without a schema change.
    const match = pathname.match(/^\/shop\/(\d+)/);
    const payload = JSON.stringify({
      bucket,
      product: match ? Number(match[1]) : undefined,
    });

    const timer = window.setTimeout(() => {
      fetch("/api/track/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }, 900); // wait a moment so bounces and prefetches are not counted

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
