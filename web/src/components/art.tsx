"use client";
import { useEffect, useId, useState } from "react";
import { motion } from "framer-motion";

/* ================================================================== */
/*  BELLA CREST — the maison's ornate golden monogram                  */
/*  (B-bottle silhouette with spray top and baroque flourishes)        */
/* ================================================================== */
export function BellaCrest({
  className = "",
  tone = "gold",
  hole = "#06120b",
}: {
  className?: string;
  tone?: "gold" | "dark" | "light";
  hole?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const bodyFill =
    tone === "gold" ? `url(#cg-${uid})` : tone === "dark" ? "#0a2a19" : "#f2e9d4";
  const strokeCol =
    tone === "gold" ? `url(#cg-${uid})` : tone === "dark" ? "#0a2a19" : "#f2e9d4";
  const letterCol = tone === "gold" ? "#0b2417" : tone === "dark" ? "#f4e3b2" : "#0a2a19";

  return (
    <svg viewBox="0 0 220 170" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`cg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6e09b" />
          <stop offset="45%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#9a7b2a" />
        </linearGradient>
      </defs>

      {/* spray atomizer with hole */}
      <path d="M102 8 L118 8 L115 30 L105 30 Z" fill={bodyFill} />
      <circle cx="110" cy="15" r="2.8" fill={hole} />
      <rect x="100" y="30" width="20" height="6" rx="2" fill={bodyFill} />
      <rect x="104" y="36" width="12" height="8" fill={bodyFill} />

      {/* bottle-shaped body */}
      <path
        d="M110 44 C82 44 63 54 61 80 C59 110 80 130 110 130 C140 130 161 110 159 80 C157 54 138 44 110 44 Z"
        fill={bodyFill}
      />
      {/* inner ring */}
      <path
        d="M110 52 C88 52 72 60 70 80 C68 104 86 121 110 121 C134 121 152 104 150 80 C148 60 132 52 110 52 Z"
        stroke={letterCol}
        strokeWidth="1"
        opacity="0.55"
      />

      {/* letter B */}
      <text
        x="110"
        y="106"
        textAnchor="middle"
        fontFamily="Cormorant Garamond, serif"
        fontSize="56"
        fontWeight="600"
        fill={letterCol}
      >
        B
      </text>

      {/* right flourishes */}
      <g stroke={strokeCol} strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M152 62 C176 48 194 60 190 78 C187 90 173 92 169 83 C166 76 173 71 178 75" />
        <path d="M154 92 C180 102 192 118 183 132 C177 142 162 138 162 128" />
        <path d="M148 52 C160 44 171 48 169 57" />
        <path d="M150 110 C161 118 170 128 163 137" />
      </g>
      {/* left flourishes (mirrored) */}
      <g
        transform="translate(220,0) scale(-1,1)"
        stroke={strokeCol}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M152 62 C176 48 194 60 190 78 C187 90 173 92 169 83 C166 76 173 71 178 75" />
        <path d="M154 92 C180 102 192 118 183 132 C177 142 162 138 162 128" />
        <path d="M148 52 C160 44 171 48 169 57" />
        <path d="M150 110 C161 118 170 128 163 137" />
      </g>

      {/* base curls */}
      <path
        d="M92 128 C96 138 124 138 128 128"
        stroke={strokeCol}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/* ---------------- raster logo files ---------------- */
export function LogoImg({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.webp" alt="بلّا پرفیوم" className={className} draggable={false} />;
}
export function CrestImg({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/crest.webp" alt="" className={className} draggable={false} />;
}

/* ================================================================== */
/*  PRODUCT VISUAL — shows the admin-uploaded product photo when one   */
/*  exists, otherwise falls back to the procedurally drawn bottle      */
/* ================================================================== */
export function ProductVisual({
  image,
  glass,
  liquid,
  alt = "",
  className = "",
}: {
  image?: string | null;
  glass?: string;
  liquid?: string;
  alt?: string;
  className?: string;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={alt} className={`object-contain ${className}`} draggable={false} />
    );
  }
  return <PerfumeBottle glass={glass} liquid={liquid} className={className} />;
}

/* ================================================================== */
/*  PERFUME BOTTLE — green-framed crystal with golden elixir,          */
/*  central atomizer tube and the crest floating in the liquid         */
/* ================================================================== */
export function PerfumeBottle({
  glass = "#0d3b26",
  liquid = "#d4af37",
  className = "",
  showCrest = true,
  fillLevel = 1,
}: {
  glass?: string;
  liquid?: string;
  className?: string;
  showCrest?: boolean;
  /** 0 = empty bottle, 1 = normal full level (the classic look used everywhere else) */
  fillLevel?: number;
}) {
  const uid = useId().replace(/[:]/g, "");
  // 58 is a genuinely brimming-full liquid line (just inside the top of the
  // cavity at y=52); 270 is the very bottom of the glass cavity (i.e.
  // completely empty).
  const clampedFill = Math.max(0, Math.min(1, fillLevel));
  const liquidTop = 270 - clampedFill * (270 - 58);
  return (
    <svg viewBox="0 0 200 285" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`gold-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6e09b" />
          <stop offset="50%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#8a6d22" />
        </linearGradient>
        <linearGradient id={`liq-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6e09b" />
          <stop offset="45%" stopColor={liquid} />
          <stop offset="100%" stopColor="#9a7b2a" />
        </linearGradient>
        <linearGradient id={`edge-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="18%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="82%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.22" />
        </linearGradient>
      </defs>

      {/* cap */}
      <rect x="86" y="2" width="28" height="26" rx="6" fill={`url(#gold-${uid})`} stroke="#6e5718" strokeWidth="1.2" />
      <circle cx="100" cy="10" r="2.6" fill="#06120b" />
      {[93, 100, 107].map((x) => (
        <line key={x} x1={x} y1="16" x2={x} y2="26" stroke="#7a5f1a" strokeWidth="1.2" opacity="0.6" />
      ))}
      {/* collar + stem */}
      <rect x="90" y="28" width="20" height="6" rx="2" fill={`url(#gold-${uid})`} />
      <rect x="95" y="34" width="10" height="10" fill={`url(#gold-${uid})`} opacity="0.9" />

      {/* glass body frame */}
      <rect x="26" y="44" width="148" height="234" rx="30" fill={glass} stroke="#1f6b45" strokeWidth="2" />
      <rect x="26" y="44" width="148" height="234" rx="30" fill={`url(#edge-${uid})`} />
      {/* inner cavity */}
      <rect x="34" y="52" width="132" height="218" rx="24" fill="#04120a" />

      {/* golden liquid — a rounded rect anchored to the cavity's own floor,
          so its corners always follow the exact curvature of the glass
          cavity (rx 24, same as the cavity above) instead of a sharp cut.
          Plain SVG attributes (not framer-motion's animate prop) are used
          here so the shape is always guaranteed to actually paint, with a
          CSS transition handling the smooth rise/fall. */}
      <rect
        x="34"
        y={liquidTop}
        width="132"
        height={Math.max(0, 270 - liquidTop)}
        rx="24"
        fill={`url(#liq-${uid})`}
        style={{ transition: "y 0.9s cubic-bezier(0.22,1,0.36,1), height 0.9s cubic-bezier(0.22,1,0.36,1)" }}
      />
      <ellipse
        cx="100"
        cy={liquidTop}
        rx="60"
        ry="4"
        fill="#fff"
        opacity="0.28"
        style={{ transition: "cy 0.9s cubic-bezier(0.22,1,0.36,1)" }}
      />

      {/* atomizer tube */}
      <rect x="98.6" y="44" width="2.8" height="226" fill="#caa24a" opacity="0.65" />

      {/* bubbles */}
      {[
        [70, 200, 2],
        [128, 232, 2.6],
        [88, 252, 1.6],
        [136, 178, 1.4],
      ].map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff" opacity="0.3" />
      ))}

      {/* brand crest label floating in the liquid */}
      {showCrest && (
        <g>
          <rect x="66" y="158" width="68" height="56" rx="12" fill="#06170e" opacity="0.55" />
          <image href="/crest.webp" x="72" y="158" width="56" height="44" preserveAspectRatio="xMidYMid meet" />
          <text x="100" y="210" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="8.5" letterSpacing="2.5" fill="#f4e3b2" opacity="0.9">BELLA</text>
        </g>
      )}

      {/* glass shine */}
      <path d="M44 62 q-5 96 6 196" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.18" />
    </svg>
  );
}

/* ================================================================== */
/*  Floating golden dust particles                                     */
/* ================================================================== */
type Dot = {
  id: number;
  left: number;
  top: number;
  size: number;
  delay: number;
  dur: number;
  o: number;
  x: number;
};

export function GoldDust({ count = 26 }: { count?: number }) {
  // BUG FIX: Math.random() inside useMemo ran on the server AND the client with
  // different results, which produced a React hydration mismatch on every load.
  // The particles are decorative, so they are generated after mount only.
  const [dots, setDots] = useState<Dot[]>([]);

  useEffect(() => {
    setDots(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: 20 + Math.random() * 80,
        size: 2 + Math.random() * 4,
        delay: Math.random() * 12,
        dur: 9 + Math.random() * 12,
        o: 0.25 + Math.random() * 0.5,
        x: (Math.random() - 0.5) * 80,
      })),
    );
  }, [count]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {dots.map((d) => (
        <span
          key={d.id}
          className="absolute rounded-full bg-gold"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            opacity: 0,
            filter: "blur(0.4px)",
            boxShadow: "0 0 8px rgba(212,175,55,0.8)",
            ["--dust-o" as string]: d.o,
            ["--dust-x" as string]: `${d.x}px`,
            animation: `dust ${d.dur}s linear ${d.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
