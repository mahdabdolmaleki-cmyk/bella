import type { NextConfig } from "next";

// The Express API base URL. In the browser, requests to /api/* and /uploads/*
// are transparently proxied to this backend via the rewrites below, so cookies
// stay first-party (no CORS headaches during development).
//
// BUG FIX: این مقدار قبلاً می‌توانست به دامنهٔ عمومی (مثل http://bellaperfume.ir)
// اشاره کند که در سرور تولید، درخواست را از DNS/nginx عمومی رد می‌کرد و اگر
// nginx مسیر /uploads را به بک‌اند نمی‌داد، همهٔ عکس‌ها می‌شکستند. حالا
// اولویت با آدرس داخلی است: بک‌اند و Next روی یک ماشین‌اند.
const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";
const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: blocks injected scripts, iframes and data
// exfiltration. 'unsafe-inline' is required by Next.js for its inline
// bootstrap script; 'unsafe-eval' is only needed by the dev fast-refresh
// runtime, so it is excluded from production builds.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // The enamad trust seal must be loaded live from enamad's own server.
  "img-src 'self' data: blob: https://trustseal.enamad.ir https://*.enamad.ir",
  "font-src 'self' data:",
  // HARDENING: the API is reached through the /api rewrite proxy, i.e. it is
  // always same-origin from the browser's point of view. Allowing the raw
  // API_BASE here let any injected script talk to an arbitrary host in
  // production; it is now only permitted in development.
  `connect-src 'self'${isDev ? ` ${API_BASE} ws: wss:` : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // BUG FIX: 'none' made the browser block the Aparat/YouTube players on
  // tutorial pages. Only these two embed hosts are allowed; any other
  // iframe is still blocked.
  "frame-src https://www.aparat.com https://www.youtube.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" }, // clickjacking
  { key: "X-Content-Type-Options", value: "nosniff" }, // MIME sniffing
  // "0" is the current OWASP/MDN recommendation: the old browser XSS auditor
  // ("1; mode=block") was itself exploitable and has been removed from
  // browsers; real XSS protection comes from the CSP above.
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework version to attackers.
  poweredByHeader: false,
  reactStrictMode: true,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // PWA: a new service worker version must reach phones immediately.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        // HARDENING: the admin panel must never be cached by a browser, a proxy
        // or a CDN, otherwise the next person on a shared computer can press
        // Back and read the previous admin's data.
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "Pragma", value: "no-cache" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },

  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_BASE}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_BASE}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
