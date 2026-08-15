"use client";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  y = 34,
  className = "",
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-60px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Reveal>
        <p className="font-display text-[11px] font-semibold tracking-[0.45em] text-gold uppercase">
          {eyebrow}
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="mt-2.5 text-[21px] leading-snug font-black text-cream sm:text-3xl md:text-[2.4rem]">
          {title}
        </h2>
      </Reveal>
      <Reveal delay={0.14}>
        <div className="mx-auto mt-5 flex items-center justify-center gap-3">
          <span className="hairline h-px w-16" />
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 0l1.8 5.2L14 7l-5.2 1.8L7 14 5.2 8.8 0 7l5.2-1.8z" fill="#d4af37" />
          </svg>
          <span className="hairline h-px w-16" />
        </div>
      </Reveal>
      {sub && (
        <Reveal delay={0.2}>
          <p className="mt-4 text-[12.5px] leading-7 text-sage sm:text-sm md:text-base">{sub}</p>
        </Reveal>
      )}
    </div>
  );
}
