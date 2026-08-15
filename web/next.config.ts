import type { NextConfig } from "next";

// The Express API base URL. In the browser, requests to /api/* and /uploads/*
// are transparently proxied to this backend via the rewrites below, so cookies
// stay first-party (no CORS headaches during development).
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: blocks injected scripts, iframes and data
// exfiltration. 'unsafe-inline' is required by Next.js for its inline
// bootstrap script; 'unsafe-eval' is only needed by the dev fast-refresh
// runtime, so it is excluded from production builds.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // HARDENING: the API is reached through the /api rewrite proxy, i.e. it is
  // always same-origin from the browser's point of view. Allowing the raw
  // API_BASE here let any injected script talk to an arbitrary host in
  // production; it is now only permitted in development.
  `connect-src 'self'${isDev ? ` ${API_BASE} ws: wss:` : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
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
