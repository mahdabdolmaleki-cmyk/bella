"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  BookOpen,
  PlayCircle,
  Search,
  ThumbsUp,
  Eye,
  RefreshCw,
  GraduationCap,
} from "lucide-react";
import { Reveal } from "./ui";
import { toFa } from "@/lib/data";
import { faDate, type TutorialCard } from "@/lib/tutorials";

/**
 * فهرست مطالب آموزشی با نوار دسته‌بندی و جست‌وجو.
 *
 * دسته‌ها از خود مطالب می‌آیند (سرور distinct می‌گیرد)، پس هر دستهٔ تازه‌ای
 * که ادمین در پنل تایپ کند خودبه‌خود اینجا ظاهر می‌شود.
 */
export default function TutorialList() {
  const [rows, setRows] = useState<TutorialCard[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("همه");
  const [q, setQ] = useState("");
  const [error, setError] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setError(false);
      const params = new URLSearchParams();
      if (category !== "همه") params.set("category", category);
      const term = q.trim();
      if (term) params.set("search", term);
      const qs = params.toString();
      fetch(`/api/tutorials${qs ? `?${qs}` : ""}`, { signal })
        .then((r) => r.json())
        .then((d) => {
          setRows(d.tutorials ?? []);
          // فهرست دسته‌ها همیشه کامل است، حتی وقتی فیلتر فعال است — وگرنه
          // با انتخاب یک دسته، بقیهٔ دکمه‌ها ناپدید می‌شدند.
          if (Array.isArray(d.categories) && d.categories.length) {
            setCategories(d.categories);
          }
        })
        .catch((err) => {
          if ((err as { name?: string })?.name !== "AbortError") setError(true);
        });
    },
    [category, q],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => load(ctrl.signal), q.trim() ? 350 : 0);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [load, q]);

  const chips = useMemo(() => ["همه", ...categories], [categories]);

  return (
    <section className="relative py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="flex flex-wrap items-center justify-center gap-2">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-5 py-2 text-xs font-bold transition-all duration-300 ${
                category === c
                  ? "bg-gold text-[#241a05] shadow-[0_4px_18px_rgba(212,175,55,0.4)]"
                  : "border border-gold/30 text-gold-soft hover:bg-gold/10"
              }`}
            >
              {c}
            </button>
          ))}
        </Reveal>

        <Reveal delay={0.1} className="mx-auto mt-5 max-w-md">
          <div className="flex items-center gap-2 rounded-full glass-panel px-4 py-2.5 transition-colors focus-within:border-gold/60">
            <Search size={15} className="text-gold/70" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو در آموزش‌ها…"
              className="w-full bg-transparent text-sm text-cream placeholder:text-sage/40 focus:outline-none"
            />
          </div>
        </Reveal>

        {error ? (
          <div className="mt-16 text-center">
            <p className="text-sm text-sage">خطا در دریافت آموزش‌ها.</p>
            <button
              onClick={() => load()}
              className="btn-ghost mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold"
            >
              <RefreshCw size={14} /> تلاش دوباره
            </button>
          </div>
        ) : !rows ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-3xl glass-panel" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-16 text-center">
            <GraduationCap size={40} className="mx-auto text-gold/40" />
            <p className="mt-4 text-sm text-sage">
              هنوز آموزشی در این بخش منتشر نشده است.
            </p>
          </div>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((t, i) => (
              <motion.article
                key={t.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
                className="group flex flex-col overflow-hidden rounded-3xl glass-panel transition-all duration-500 hover:-translate-y-1.5 hover:border-gold/50 hover:shadow-[0_20px_60px_rgba(212,175,55,0.15)]"
              >
                <Link href={`/learn/${t.id}`} className="relative block h-40 overflow-hidden">
                  {t.cover ? (
                    <Image
                      src={t.cover}
                      alt={t.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center bg-gradient-to-br from-moss/60 to-night">
                      <BookOpen size={34} className="text-gold/50" />
                    </span>
                  )}
                  <span className="absolute top-3 right-3 rounded-full bg-night/80 px-3 py-1 text-[10px] font-bold text-gold-soft backdrop-blur">
                    {t.category}
                  </span>
                  {t.hasVideo && (
                    <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-rose-500/85 px-2.5 py-1 text-[10px] font-bold text-white">
                      <PlayCircle size={12} /> ویدئو
                    </span>
                  )}
                </Link>

                <div className="flex flex-1 flex-col p-5 text-right">
                  <Link
                    href={`/learn/${t.id}`}
                    className="text-base font-black text-cream transition-colors hover:text-gold"
                  >
                    {t.title}
                  </Link>
                  {t.excerpt && (
                    <p className="mt-2 line-clamp-3 text-xs leading-6 text-sage">{t.excerpt}</p>
                  )}

                  <div className="mt-auto flex items-center gap-3 border-t border-gold/10 pt-3 text-[11px] text-sage">
                    <span className="flex items-center gap-1.5">
                      <ThumbsUp size={12} className="text-emerald-300" /> {toFa(t.likes)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Eye size={12} className="text-sky-300" /> {toFa(t.views)}
                    </span>
                    <span className="mr-auto">{faDate(t.createdAt)}</span>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
