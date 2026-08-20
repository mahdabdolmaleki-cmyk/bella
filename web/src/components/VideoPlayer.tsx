"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Loader2,
  Gauge,
} from "lucide-react";

/**
 * پخش‌کنندهٔ اختصاصی بلا.
 *
 * چرا کنترل پیش‌فرض مرورگر را نگه نداشتیم: هر مرورگر ظاهر خودش را می‌سازد
 * (کروم نوار خاکستری، سافاری شیشه‌ای آبی) و هیچ‌کدام با تم سبز/طلایی سایت
 * جور نبود. اینجا خود ویدئو بدون کنترل رندر می‌شود و نوار پایین را خودمان
 * می‌کشیم.
 *
 * نکته‌های مهم پیاده‌سازی:
 *  - جهت نوار پیشرفت عمداً LTR است. در صفحهٔ RTL اگر نوار را رها کنیم،
 *    ثانیهٔ صفر سمت راست می‌افتد و کاربر حس می‌کند ویدئو برعکس جلو می‌رود.
 *  - وضعیت از خود المان video خوانده می‌شود، نه از state موازی؛ اگر کاربر
 *    با کیبورد یا از حالت تمام‌صفحهٔ سیستم پخش را عوض کند، دکمه هم‌گام می‌ماند.
 */

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "۰:۰۰";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const raw = `${m}:${String(s).padStart(2, "0")}`;
  return raw.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export default function VideoPlayer({
  src,
  poster,
  title,
}: {
  src: string;
  poster?: string;
  title?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** نوار کنترل بعد از سه ثانیه بی‌حرکتی محو می‌شود — ولی هرگز وقتی ویدئو ایستاده. */
  const poke = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setUiVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
    poke();
  }, [poke]);

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(v.currentTime + delta, 0), v.duration || 0);
    poke();
  };

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Number(e.target.value);
    v.currentTime = next;
    setTime(next);
  };

  const onVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Number(e.target.value);
    v.volume = next;
    v.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const pickSpeed = (value: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = value;
    setSpeed(value);
    setSpeedOpen(false);
  };

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void wrapRef.current?.requestFullscreen().catch(() => {});
  };

  /** میان‌برهای کیبورد فقط وقتی خود پخش‌کننده فوکوس دارد — تا اسکرول صفحه نپرد. */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seekBy(5); // در RTL، فلش چپ یعنی «جلو»
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seekBy(-5);
    } else if (e.key === "m") {
      toggleMute();
    } else if (e.key === "f") {
      toggleFull();
    }
  };

  const progress = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      dir="ltr"
      tabIndex={0}
      onKeyDown={onKey}
      onMouseMove={poke}
      onMouseLeave={() => playing && setUiVisible(false)}
      className="group bella-player relative overflow-hidden rounded-3xl border border-gold/25 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.45)] focus:outline-none focus-visible:border-gold"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        title={title}
        playsInline
        preload="metadata"
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          poke();
        }}
        onPause={() => {
          setPlaying(false);
          setUiVisible(true);
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => {
          setPlaying(false);
          setUiVisible(true);
        }}
        className="aspect-video w-full cursor-pointer bg-black"
      />

      {/* دکمهٔ بزرگ وسط — فقط تا وقتی پخش شروع نشده */}
      {!playing && !waiting && (
        <button
          type="button"
          onClick={toggle}
          aria-label="پخش"
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/55 via-transparent to-black/25"
        >
          <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-gold/50 bg-gold/90 text-[#241a05] shadow-[0_10px_40px_rgba(212,175,55,0.45)] transition-transform duration-300 hover:scale-110">
            <Play size={28} className="ml-1" fill="currentColor" />
          </span>
        </button>
      )}

      {waiting && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 size={38} className="animate-spin text-gold" />
        </span>
      )}

      {/* نوار کنترل */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pt-8 pb-2.5 transition-opacity duration-300 sm:px-4 ${
          uiVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* خط پیشرفت */}
        <div className="relative h-1.5 w-full rounded-full bg-white/20">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-deep via-gold to-gold-soft"
            style={{ width: `${progress}%` }}
          />
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold opacity-0 shadow-[0_0_12px_rgba(212,175,55,0.9)] transition-opacity group-hover:opacity-100"
            style={{ left: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            onChange={onScrub}
            aria-label="زمان پخش"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="mt-2 flex items-center gap-2 text-cream">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "توقف" : "پخش"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-[#241a05] transition-transform hover:scale-105"
          >
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>

          <button
            type="button"
            onClick={() => seekBy(-10)}
            aria-label="۱۰ ثانیه عقب"
            className="hidden h-9 w-9 items-center justify-center rounded-full text-sage transition-colors hover:bg-white/10 hover:text-cream sm:flex"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={() => seekBy(10)}
            aria-label="۱۰ ثانیه جلو"
            className="hidden h-9 w-9 items-center justify-center rounded-full text-sage transition-colors hover:bg-white/10 hover:text-cream sm:flex"
          >
            <RotateCw size={16} />
          </button>

          <div className="flex items-center gap-1.5" dir="ltr">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "صدادار" : "بی‌صدا"}
              className="flex h-9 w-9 items-center justify-center rounded-full text-sage transition-colors hover:bg-white/10 hover:text-cream"
            >
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={onVolume}
              aria-label="بلندی صدا"
              className="player-range hidden w-16 sm:block"
            />
          </div>

          <span className="mx-1 font-mono text-[11px] tracking-wider text-sage" dir="ltr">
            {clock(time)} / {clock(duration)}
          </span>

          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setSpeedOpen((s) => !s)}
              aria-label="سرعت پخش"
              className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold text-sage transition-colors hover:bg-white/10 hover:text-cream"
            >
              <Gauge size={15} />
              {speed}×
            </button>
            {speedOpen && (
              <div className="absolute bottom-11 right-0 overflow-hidden rounded-xl border border-gold/25 bg-[#0b1a12]/95 backdrop-blur">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pickSpeed(s)}
                    className={`block w-16 px-3 py-1.5 text-[11px] font-bold transition-colors hover:bg-gold/15 ${
                      s === speed ? "text-gold" : "text-sage"
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleFull}
            aria-label="تمام‌صفحه"
            className="flex h-9 w-9 items-center justify-center rounded-full text-sage transition-colors hover:bg-white/10 hover:text-cream"
          >
            {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
