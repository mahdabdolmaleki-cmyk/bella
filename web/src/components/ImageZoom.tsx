"use client";
// زومِ تمام‌صفحهٔ تصویر محصول (v46): دابل‌تپ/دابل‌کلیک، pinch دو انگشت،
// درگ برای جابه‌جایی وقتی زوم شده، چرخ ماوس، و دکمه‌های +/- — بدون وابستگی جدید.
import { useEffect, useRef, useState } from "react";
import { X, Plus, Minus } from "lucide-react";

const MIN = 1;
const MAX = 6;

type Pos = { x: number; y: number };

export default function ImageZoom({
  src,
  alt = "",
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const posRef = useRef<Pos>({ x: 0, y: 0 });
  scaleRef.current = scale;
  posRef.current = pos;

  const pointers = useRef(new Map<number, Pos>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const pan = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const dist2 = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, a.y - b.y);
  const isZoomControl = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest("[data-zoom-controls]"));

  /** زوم به مقدار next حول نقطهٔ (cx,cy) با محدودکردنِ جابه‌جایی. */
  const applyZoom = (next: number, cx?: number, cy?: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    const s1 = scaleRef.current;
    const s2 = Math.min(MAX, Math.max(MIN, next));
    if (!box) return;
    const mxp = cx ?? box.left + box.width / 2;
    const myp = cy ?? box.top + box.height / 2;
    const px = mxp - (box.left + box.width / 2);
    const py = myp - (box.top + box.height / 2);
    const k = s2 / s1;
    setPos((p) => {
      let nx = px - (px - p.x) * k;
      let ny = py - (py - p.y) * k;
      const mx = ((s2 - 1) * box.width) / 2;
      const my = ((s2 - 1) * box.height) / 2;
      nx = Math.max(-mx, Math.min(mx, nx));
      ny = Math.max(-my, Math.min(my, ny));
      if (s2 === MIN) {
        nx = 0;
        ny = 0;
      }
      return { x: nx, y: ny };
    });
    setScale(s2);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // کنترل‌های HTML نباید وارد gesture/pointer-capture والد شوند؛ در ویندوز
    // این capture می‌توانست click دکمه‌های +/- را از خود دکمه بگیرد.
    if (isZoomControl(e.target)) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: dist2(a, b), scale: scaleRef.current };
      pan.current = null;
    } else if (pointers.current.size === 1) {
      pan.current = {
        sx: e.clientX,
        sy: e.clientY,
        px: posRef.current.x,
        py: posRef.current.y,
        moved: false,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = dist2(a, b);
      if (pinch.current.dist > 0) {
        applyZoom(
          pinch.current.scale * (d / pinch.current.dist),
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
        );
      }
    } else if (pan.current && scaleRef.current > MIN) {
      const dx = e.clientX - pan.current.sx;
      const dy = e.clientY - pan.current.sy;
      if (Math.hypot(dx, dy) > 4) pan.current.moved = true;
      const box = boxRef.current?.getBoundingClientRect();
      if (box) {
        const s = scaleRef.current;
        const mx = ((s - 1) * box.width) / 2;
        const my = ((s - 1) * box.height) / 2;
        setPos({
          x: Math.max(-mx, Math.min(mx, pan.current.px + dx)),
          y: Math.max(-my, Math.min(my, pan.current.py + dy)),
        });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0 && pan.current) {
      const wasMoved = pan.current.moved;
      pan.current = null;
      if (!wasMoved) {
        // دابل‌تپ: زوم روی نقطهٔ لمس، یا برگشت به ۱
        const now = Date.now();
        const lt = lastTap.current;
        if (now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 28) {
          lastTap.current = { t: 0, x: 0, y: 0 };
          if (scaleRef.current > MIN) applyZoom(MIN);
          else applyZoom(2.5, e.clientX, e.clientY);
        } else {
          lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        }
      }
    }
  };

  const btn =
    "flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-night/80 text-cream backdrop-blur transition hover:bg-gold hover:text-night";

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label={`زوم تصویر ${alt}`}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-night/95 backdrop-blur-sm"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={(e) =>
        applyZoom(scaleRef.current * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY)
      }
      onClick={(e) => {
        if (e.target === e.currentTarget && scaleRef.current === MIN) onClose();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-[92svh] max-w-[94vw] select-none object-contain"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
      />

      <button
        type="button"
        data-zoom-controls
        aria-label="بستن زوم"
        className="absolute top-4 left-4 flex h-11 w-11 items-center justify-center rounded-full border border-gold/30 bg-night/80 text-cream backdrop-blur transition hover:bg-gold hover:text-night"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <X size={20} />
      </button>

      <span className="absolute top-5 right-4 rounded-full bg-night/75 px-3 py-1 text-[11px] font-bold text-cream/90 backdrop-blur">
        {Math.round(scale * 100)}٪
      </span>

      <div
        data-zoom-controls
        className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerCancel={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="کوچک‌نمایی" className={btn} onClick={() => applyZoom(scaleRef.current / 1.4)}>
          <Minus size={18} />
        </button>
        <button type="button" aria-label="بزرگ‌نمایی" className={btn} onClick={() => applyZoom(scaleRef.current * 1.4)}>
          <Plus size={18} />
        </button>
      </div>

      <p className="absolute bottom-5 right-4 hidden text-[10px] font-bold text-sage/90 sm:block">
        {scale === MIN ? "دابل‌تپ یا دو انگشت برای زوم" : "یک انگشت برای جابه‌جایی"}
      </p>
    </div>
  );
}
