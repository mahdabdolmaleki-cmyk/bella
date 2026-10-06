"use client";
import { motion } from "framer-motion";
import { CrestImg } from "./art";

export default function PageHero({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <section className="relative overflow-hidden pt-24 pb-8 sm:pt-32 sm:pb-12">
      <div className="vignette absolute inset-0" />
      <div className="absolute top-0 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-pine/40 blur-[80px]" />
      <motion.div
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-2xl px-5 text-center"
      >
        <CrestImg className="mx-auto w-32 rounded-xl sm:w-40" />
        <p className="font-display mt-1 text-[10px] font-semibold tracking-[0.4em] text-gold">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-black text-cream sm:text-4xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-[12.5px] leading-7 text-sage sm:text-sm">{sub}</p>
        <div className="mx-auto mt-5 flex items-center justify-center gap-3">
          <span className="hairline h-px w-14" />
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 0l1.8 5.2L14 7l-5.2 1.8L7 14 5.2 8.8 0 7l5.2-1.8z" fill="#d4af7c" />
          </svg>
          <span className="hairline h-px w-14" />
        </div>
      </motion.div>
    </section>
  );
}
